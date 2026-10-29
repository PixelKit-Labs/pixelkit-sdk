package com.pixelkit.sysmetrics;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * SystemMetricsDaemon
 *
 * Zero-dependency daemon that exposes real CPU / GPU / TPU load to local apps. Runs as
 * uid 2000 (shell) via app_process, because shell can read /proc/stat (denied to apps) and
 * can write the tracefs power events that report GPU work.
 *
 * Endpoints on 127.0.0.1:11081:
 *   GET /ping     -> {"ok":true,"version":"...","uid":N}
 *   GET /metrics  -> latest completed sampling window (about 1 s), see README.md
 *
 * Sources (nothing is simulated; a value that cannot be read is null with an error string):
 *   CPU: /proc/stat jiffy deltas (system + per core).
 *   GPU: tracefs power/gpu_work_period (per-uid active ns) and power/gpu_frequency, read from
 *        trace_pipe; memory from `dumpsys gpu` "Global total".
 *   TPU: not readable from the shell uid on the supported device. A perfetto probe records the
 *        evidence for that (see TpuProbe); no TPU number is ever served.
 */
public class SystemMetricsDaemon {
    static final String VERSION = "1.0.0";
    static final int PORT = 11081;
    static final long WINDOW_MS = 1000L;
    static final long DUMPSYS_INTERVAL_MS = 5000L;
    static final long DUMPSYS_MAX_AGE_MS = 15000L;
    static final long TPU_REPROBE_MS = 30L * 60L * 1000L;
    static final int TOP_PROCESSES = 5;

    static final String TRACEFS = "/sys/kernel/tracing";
    static final String EN_WORK_PERIOD = TRACEFS + "/events/power/gpu_work_period/enable";
    static final String EN_FREQUENCY = TRACEFS + "/events/power/gpu_frequency/enable";
    static final String TRACING_ON = TRACEFS + "/tracing_on";
    static final String TRACE_PIPE = TRACEFS + "/trace_pipe";
    static final String GPU_DEVFREQ_CUR_FREQ = "/sys/class/devfreq/34f00000.gpu0/cur_freq";
    static final String STATE_FILE = "/data/local/tmp/pixelkit-sysmetrics.state";

    private static final TraceEnables enables = new TraceEnables();
    private static final GpuTraceReader traceReader = new GpuTraceReader();
    private static final GpuMemoryPoller memoryPoller = new GpuMemoryPoller();
    private static final TpuProbe tpuProbe = new TpuProbe();
    private static volatile String latestMetricsJson = null;

    public static void main(String[] args) {
        System.out.println("[PixelKit SystemMetricsDaemon] Starting v" + VERSION + " on uid "
                + android.os.Process.myUid() + " (pid " + android.os.Process.myPid() + ")");

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("[PixelKit SystemMetricsDaemon] Shutting down, restoring tracefs state...");
            tpuProbe.stop();
            enables.restore();
        }, "shutdown-restore"));

        ServerSocket server;
        try {
            server = new ServerSocket(PORT, 50, InetAddress.getByName("127.0.0.1"));
        } catch (IOException e) {
            System.err.println("[PixelKit SystemMetricsDaemon] Cannot bind 127.0.0.1:" + PORT + ": " + e.getMessage());
            System.exit(1);
            return;
        }

        enables.enable();
        traceReader.start();
        memoryPoller.start();
        tpuProbe.start();
        Thread sampler = new Thread(SystemMetricsDaemon::samplerLoop, "sampler");
        sampler.setDaemon(true);
        sampler.start();

        System.out.println("[PixelKit SystemMetricsDaemon] Listening on http://127.0.0.1:" + PORT);
        ExecutorService pool = Executors.newFixedThreadPool(4);
        while (true) {
            try {
                Socket client = server.accept();
                pool.execute(() -> handleClient(client));
            } catch (IOException e) {
                System.err.println("[PixelKit SystemMetricsDaemon] accept failed: " + e.getMessage());
                System.exit(1);
            }
        }
    }

    // ------------------------------------------------------------------------------------
    // Sampler
    // ------------------------------------------------------------------------------------

    private static void samplerLoop() {
        CpuSampler cpu = new CpuSampler();
        cpu.sample(); // baseline
        for (int i = 0; i < 40 && traceReader.pipeGeneration() == 0; i++) {
            try { Thread.sleep(50); } catch (InterruptedException e) { return; }
        }
        traceReader.drainWindow(); // baseline: discard events seen before the first window
        long windowStartNs = System.nanoTime();
        long windowStartTraceGeneration = traceReader.pipeGeneration();

        while (true) {
            try {
                Thread.sleep(WINDOW_MS);
            } catch (InterruptedException e) {
                return;
            }
            long nowNs = System.nanoTime();
            long windowNs = nowNs - windowStartNs;
            long epochMs = System.currentTimeMillis();
            try {
                String enableProblem = enables.verifyAndReassert();
                GpuTraceReader.Window gpuWindow = traceReader.drainWindow();
                String json = buildMetricsJson(cpu.sample(), gpuWindow, enableProblem,
                        windowNs, windowStartTraceGeneration, epochMs);
                latestMetricsJson = json;
                windowStartTraceGeneration = traceReader.pipeGeneration();
            } catch (Throwable t) {
                System.err.println("[PixelKit SystemMetricsDaemon] sampler error: " + t);
            }
            windowStartNs = nowNs;
        }
    }

    private static String buildMetricsJson(CpuSampler.Result cpu, GpuTraceReader.Window gpuWindow,
            String enableProblem, long windowNs, long generationAtWindowStart, long epochMs) {
        StringBuilder sb = new StringBuilder(768);
        sb.append("{\"version\":").append(str(VERSION))
                .append(",\"uid\":").append(android.os.Process.myUid())
                .append(",\"sampledAtMs\":").append(epochMs)
                .append(",\"windowMs\":").append(Math.max(1L, Math.round(windowNs / 1e6)));

        // cpu
        sb.append(",\"cpu\":{");
        if (cpu.error != null) {
            sb.append("\"source\":\"unavailable\",\"error\":").append(str(cpu.error))
                    .append(",\"utilizationPercent\":null,\"perCorePercent\":[]}");
        } else {
            sb.append("\"source\":\"hardware\",\"error\":null,\"utilizationPercent\":").append(num(cpu.total))
                    .append(",\"perCorePercent\":[");
            for (int i = 0; i < cpu.perCore.length; i++) {
                if (i > 0) sb.append(',');
                sb.append(num(cpu.perCore[i]));
            }
            sb.append("]}");
        }

        // gpu
        Double util = null;
        String gpuError = null;
        List<Map.Entry<Integer, Long>> top = new ArrayList<>();
        if (gpuWindow.pipeError != null) {
            gpuError = "gpu work-period trace unavailable: " + gpuWindow.pipeError;
        } else if (enableProblem != null) {
            gpuError = enableProblem;
        } else if (gpuWindow.pipeGeneration != generationAtWindowStart) {
            gpuError = "trace_pipe was reopened during this window; GPU utilization withheld for one window";
        } else {
            long sumNs = 0;
            for (long v : gpuWindow.activeNsByUid.values()) sumNs += v;
            util = clampPercent(100.0 * sumNs / (double) windowNs);
            top.addAll(gpuWindow.activeNsByUid.entrySet());
            top.sort((a, b) -> Long.compare(b.getValue(), a.getValue()));
        }

        Double freqHz = gpuWindow.lastFrequencyHz != null ? Double.valueOf(gpuWindow.lastFrequencyHz) : null;
        String freqError = null;
        if (freqHz == null) {
            Long cur = readLongFile(GPU_DEVFREQ_CUR_FREQ);
            if (cur != null) {
                freqHz = cur.doubleValue();
            } else {
                freqError = "gpu frequency unavailable: no gpu_frequency event seen and " + GPU_DEVFREQ_CUR_FREQ + " unreadable";
            }
        }

        GpuMemoryPoller.Snapshot mem = memoryPoller.snapshot();
        Long memBytes = null;
        String memError = null;
        if (mem.bytes != null && System.currentTimeMillis() - mem.atMs <= DUMPSYS_MAX_AGE_MS) {
            memBytes = mem.bytes;
        } else {
            memError = "gpu memory unavailable: " + (mem.error != null ? mem.error : "no `dumpsys gpu` result within the last "
                    + (DUMPSYS_MAX_AGE_MS / 1000) + " s");
        }

        String sectionError = joinErrors(gpuError, freqError, memError);
        String gpuSource;
        if (util != null) {
            gpuSource = "derived"; // ratio computed from hardware-reported per-uid busy time
        } else if (freqHz != null || memBytes != null) {
            gpuSource = "hardware"; // partial: a value was read, utilization was not
        } else {
            gpuSource = "unavailable";
        }
        sb.append(",\"gpu\":{\"source\":").append(str(gpuSource))
                .append(",\"error\":").append(sectionError == null ? "null" : str(sectionError))
                .append(",\"utilizationPercent\":").append(num(util))
                .append(",\"frequencyHz\":").append(gpuSource.equals("unavailable") || freqHz == null ? "null" : Long.toString(freqHz.longValue()))
                .append(",\"memoryUsedBytes\":").append(memBytes == null ? "null" : Long.toString(memBytes))
                .append(",\"topProcesses\":[");
        if (!gpuSource.equals("unavailable")) {
            int n = Math.min(TOP_PROCESSES, top.size());
            for (int i = 0; i < n; i++) {
                if (i > 0) sb.append(',');
                sb.append("{\"uid\":").append(top.get(i).getKey())
                        .append(",\"activePercent\":")
                        .append(num(clampPercent(100.0 * top.get(i).getValue() / (double) windowNs))).append('}');
            }
        }
        sb.append("]}");

        // tpu
        sb.append(",\"tpu\":{\"source\":\"unavailable\",\"error\":").append(str(tpuProbe.reason()))
                .append(",\"utilizationPercent\":null,\"powerState\":null}}");
        return sb.toString();
    }

    private static String joinErrors(String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (p == null) continue;
            if (sb.length() > 0) sb.append("; ");
            sb.append(p);
        }
        return sb.length() == 0 ? null : sb.toString();
    }

    // ------------------------------------------------------------------------------------
    // CPU
    // ------------------------------------------------------------------------------------

    static final class CpuSampler {
        static final class Result {
            String error;
            Double total;
            Double[] perCore = new Double[0];
        }

        private long[] prevTotals = null; // index 0 = aggregate, 1.. = cores
        private long[] prevIdles = null;

        Result sample() {
            Result r = new Result();
            long[] totals;
            long[] idles;
            try {
                byte[] raw = readAll(new FileInputStream("/proc/stat"));
                String[] lines = new String(raw, StandardCharsets.US_ASCII).split("\n");
                List<long[]> rows = new ArrayList<>();
                for (String line : lines) {
                    if (!line.startsWith("cpu")) continue;
                    String[] f = line.trim().split("\\s+");
                    if (f.length < 5) continue;
                    // user nice system idle iowait irq softirq steal; guest columns are already inside user/nice
                    long total = 0;
                    int cols = Math.min(f.length, 9);
                    for (int i = 1; i < cols; i++) total += Long.parseLong(f[i]);
                    long idle = Long.parseLong(f[4]) + (f.length > 5 ? Long.parseLong(f[5]) : 0L);
                    rows.add(new long[] {total, idle});
                }
                if (rows.isEmpty()) {
                    r.error = "/proc/stat contained no cpu lines";
                    return r;
                }
                totals = new long[rows.size()];
                idles = new long[rows.size()];
                for (int i = 0; i < rows.size(); i++) {
                    totals[i] = rows.get(i)[0];
                    idles[i] = rows.get(i)[1];
                }
            } catch (IOException | NumberFormatException e) {
                r.error = "cannot read /proc/stat: " + e.getMessage();
                prevTotals = null;
                return r;
            }

            if (prevTotals == null || prevTotals.length != totals.length) {
                prevTotals = totals;
                prevIdles = idles;
                r.error = "cpu baseline window (no previous /proc/stat sample)";
                return r;
            }
            r.total = percentOf(totals[0] - prevTotals[0], idles[0] - prevIdles[0]);
            r.perCore = new Double[totals.length - 1];
            for (int i = 1; i < totals.length; i++) {
                r.perCore[i - 1] = percentOf(totals[i] - prevTotals[i], idles[i] - prevIdles[i]);
            }
            prevTotals = totals;
            prevIdles = idles;
            if (r.total == null) r.error = "/proc/stat jiffy counters did not advance";
            return r;
        }

        private static Double percentOf(long totalDelta, long idleDelta) {
            if (totalDelta <= 0) return null; // offline core or counters did not advance
            return clampPercent(100.0 * (totalDelta - idleDelta) / (double) totalDelta);
        }
    }

    // ------------------------------------------------------------------------------------
    // GPU: tracefs enables, trace_pipe reader, dumpsys gpu memory
    // ------------------------------------------------------------------------------------

    /** Owns the two tracefs enable files this daemon turns on, and puts them back on exit. */
    static final class TraceEnables {
        private String originalWorkPeriod;
        private String originalFrequency;
        private boolean enabledByUs = false;

        synchronized void enable() {
            originalWorkPeriod = readEnable(EN_WORK_PERIOD);
            originalFrequency = readEnable(EN_FREQUENCY);
            File state = new File(STATE_FILE);
            if (state.exists()) {
                // A previous instance was killed without restoring (SIGKILL): trust its record
                // of the values before it touched anything, not the current values.
                try {
                    String[] lines = new String(readAll(new FileInputStream(state)), StandardCharsets.US_ASCII).split("\n");
                    for (String line : lines) {
                        if (line.startsWith("gpu_work_period=")) originalWorkPeriod = line.substring(16).trim();
                        if (line.startsWith("gpu_frequency=")) originalFrequency = line.substring(14).trim();
                    }
                    System.out.println("[PixelKit SystemMetricsDaemon] Recovered original tracefs state from " + STATE_FILE);
                } catch (IOException e) {
                    System.err.println("[PixelKit SystemMetricsDaemon] cannot read " + STATE_FILE + ": " + e.getMessage());
                }
            } else {
                try {
                    writeFile(STATE_FILE, "gpu_work_period=" + originalWorkPeriod + "\ngpu_frequency=" + originalFrequency + "\n");
                } catch (IOException e) {
                    System.err.println("[PixelKit SystemMetricsDaemon] cannot write " + STATE_FILE + ": " + e.getMessage());
                }
            }
            enabledByUs = true;
            startWatchdog();
            try {
                writeFile(EN_WORK_PERIOD, "1");
                writeFile(EN_FREQUENCY, "1");
            } catch (IOException e) {
                System.err.println("[PixelKit SystemMetricsDaemon] cannot enable gpu trace events: " + e.getMessage());
            }
        }

        /** Re-reads both enables (another tracer may switch them off) and tracing_on. Returns a problem or null. */
        synchronized String verifyAndReassert() {
            String problem = null;
            String[][] pairs = {{EN_WORK_PERIOD, "power/gpu_work_period"}, {EN_FREQUENCY, "power/gpu_frequency"}};
            for (String[] p : pairs) {
                String v = readEnable(p[0]);
                if (!"1".equals(v)) {
                    try {
                        writeFile(p[0], "1");
                        if (problem == null) {
                            problem = p[1] + " was switched off by another tracer (value '" + v + "'); re-enabled, "
                                    + "GPU utilization withheld for this window";
                        }
                    } catch (IOException e) {
                        problem = "cannot re-enable " + p[1] + ": " + e.getMessage();
                    }
                }
            }
            String on = readEnable(TRACING_ON);
            if (!"1".equals(on)) {
                problem = "tracefs tracing_on is '" + on + "'; gpu events are not being recorded";
            }
            return problem;
        }

        /**
         * ART does not run Java shutdown hooks on SIGTERM/SIGKILL, so a detached shell restores the
         * enables when this process disappears. It acts only while the state file exists; a clean
         * restore() deletes the file first, so the two never fight.
         */
        private void startWatchdog() {
            String script = "exec </dev/null >/dev/null 2>&1; while kill -0 " + android.os.Process.myPid()
                    + "; do sleep 2; done; if [ -e " + STATE_FILE + " ]; then echo " + sanitize(originalWorkPeriod)
                    + " > " + EN_WORK_PERIOD + "; echo " + sanitize(originalFrequency) + " > " + EN_FREQUENCY
                    + "; rm -f " + STATE_FILE + "; fi";
            try {
                new ProcessBuilder("/system/bin/sh", "-c", script).start();
            } catch (IOException e) {
                System.err.println("[PixelKit SystemMetricsDaemon] cannot start tracefs watchdog (SIGTERM will not restore): "
                        + e.getMessage());
            }
        }

        private static String sanitize(String enableValue) {
            return "1".equals(enableValue) ? "1" : "0";
        }

        synchronized void restore() {
            if (!enabledByUs) return;
            boolean ok = true;
            try {
                writeFile(EN_WORK_PERIOD, originalWorkPeriod == null ? "0" : originalWorkPeriod);
            } catch (IOException e) {
                ok = false;
                System.err.println("[PixelKit SystemMetricsDaemon] cannot restore gpu_work_period: " + e.getMessage());
            }
            try {
                writeFile(EN_FREQUENCY, originalFrequency == null ? "0" : originalFrequency);
            } catch (IOException e) {
                ok = false;
                System.err.println("[PixelKit SystemMetricsDaemon] cannot restore gpu_frequency: " + e.getMessage());
            }
            if (ok) new File(STATE_FILE).delete();
            enabledByUs = false;
        }

        private static String readEnable(String path) {
            try {
                String s = new String(readAll(new FileInputStream(path)), StandardCharsets.US_ASCII).trim();
                return s;
            } catch (IOException e) {
                return null;
            }
        }
    }

    /** Reads trace_pipe on a background thread and accumulates gpu_work_period / gpu_frequency events. */
    static final class GpuTraceReader {
        static final class Window {
            Map<Integer, Long> activeNsByUid = new HashMap<>();
            Long lastFrequencyHz;
            String pipeError;
            long pipeGeneration;
        }

        private static final byte[] WORK_PERIOD = "gpu_work_period:".getBytes(StandardCharsets.US_ASCII);
        private static final byte[] FREQUENCY = "gpu_frequency:".getBytes(StandardCharsets.US_ASCII);

        private final Object lock = new Object();
        private Map<Integer, Long> activeNsByUid = new HashMap<>();
        private Long lastFrequencyHz = null; // survives windows: it is the last value seen
        private String pipeError = "trace_pipe not opened yet";
        private long generation = 0;

        void start() {
            Thread t = new Thread(this::run, "trace-pipe");
            t.setDaemon(true);
            t.start();
        }

        long pipeGeneration() {
            synchronized (lock) {
                return generation;
            }
        }

        Window drainWindow() {
            Window w = new Window();
            synchronized (lock) {
                w.activeNsByUid = activeNsByUid;
                activeNsByUid = new HashMap<>();
                w.lastFrequencyHz = lastFrequencyHz;
                w.pipeError = pipeError;
                w.pipeGeneration = generation;
            }
            return w;
        }

        private void run() {
            byte[] chunk = new byte[16384];
            byte[] line = new byte[4096];
            while (true) {
                InputStream in = null;
                try {
                    in = new FileInputStream(TRACE_PIPE);
                    synchronized (lock) {
                        generation++;
                        pipeError = null;
                    }
                    int len = 0;
                    boolean overflow = false;
                    int n;
                    while ((n = in.read(chunk)) > 0) {
                        for (int i = 0; i < n; i++) {
                            byte c = chunk[i];
                            if (c == '\n') {
                                if (!overflow) handleLine(line, len);
                                len = 0;
                                overflow = false;
                            } else if (len < line.length) {
                                line[len++] = c;
                            } else {
                                overflow = true;
                            }
                        }
                    }
                    setPipeError("trace_pipe returned EOF (tracing was turned off or the buffer was reset)");
                } catch (IOException e) {
                    setPipeError("cannot read " + TRACE_PIPE + ": " + e.getMessage());
                } finally {
                    if (in != null) try { in.close(); } catch (IOException ignored) {}
                }
                try {
                    Thread.sleep(2000);
                } catch (InterruptedException e) {
                    return;
                }
            }
        }

        private void setPipeError(String message) {
            synchronized (lock) {
                pipeError = message;
            }
        }

        private void handleLine(byte[] line, int len) {
            int at = indexOf(line, len, WORK_PERIOD);
            if (at >= 0) {
                String s = new String(line, at, len - at, StandardCharsets.US_ASCII);
                Long uid = fieldLong(s, "uid=");
                Long active = fieldLong(s, "total_active_duration_ns=");
                if (uid != null && active != null && active > 0) {
                    synchronized (lock) {
                        Long prev = activeNsByUid.get(uid.intValue());
                        activeNsByUid.put(uid.intValue(), (prev == null ? 0L : prev) + active);
                    }
                }
                return;
            }
            at = indexOf(line, len, FREQUENCY);
            if (at >= 0) {
                String s = new String(line, at, len - at, StandardCharsets.US_ASCII);
                Long gpuId = fieldLong(s, "gpu_id=");
                Long state = fieldLong(s, "state=");
                if (state != null && (gpuId == null || gpuId == 0L)) {
                    synchronized (lock) {
                        lastFrequencyHz = state;
                    }
                }
            }
        }

        private static int indexOf(byte[] hay, int len, byte[] needle) {
            outer:
            for (int i = 0; i <= len - needle.length; i++) {
                for (int j = 0; j < needle.length; j++) {
                    if (hay[i + j] != needle[j]) continue outer;
                }
                return i;
            }
            return -1;
        }

        /** Parses `<key><digits>` where the key is a whole token (preceded by start or a space). */
        private static Long fieldLong(String s, String key) {
            int from = 0;
            while (true) {
                int i = s.indexOf(key, from);
                if (i < 0) return null;
                if (i == 0 || s.charAt(i - 1) == ' ') {
                    int j = i + key.length();
                    int k = j;
                    while (k < s.length() && Character.isDigit(s.charAt(k))) k++;
                    if (k == j) return null;
                    try {
                        return Long.parseLong(s.substring(j, k));
                    } catch (NumberFormatException e) {
                        return null;
                    }
                }
                from = i + 1;
            }
        }
    }

    /** Runs `dumpsys gpu` every few seconds and keeps the "Global total" byte count. */
    static final class GpuMemoryPoller {
        static final class Snapshot {
            Long bytes;
            String error;
            long atMs;
        }

        private final Object lock = new Object();
        private Snapshot latest = new Snapshot();

        GpuMemoryPoller() {
            latest.error = "`dumpsys gpu` has not completed yet";
        }

        void start() {
            Thread t = new Thread(() -> {
                while (true) {
                    Snapshot s = poll();
                    synchronized (lock) {
                        // keep the last good value when a later poll fails; snapshot() ages it out
                        if (s.bytes != null || latest.bytes == null) latest = s;
                        else latest.error = s.error;
                    }
                    try {
                        Thread.sleep(DUMPSYS_INTERVAL_MS);
                    } catch (InterruptedException e) {
                        return;
                    }
                }
            }, "gpu-memory");
            t.setDaemon(true);
            t.start();
        }

        Snapshot snapshot() {
            synchronized (lock) {
                Snapshot c = new Snapshot();
                c.bytes = latest.bytes;
                c.error = latest.error;
                c.atMs = latest.atMs;
                return c;
            }
        }

        private Snapshot poll() {
            Snapshot s = new Snapshot();
            Process p = null;
            try {
                p = new ProcessBuilder("/system/bin/dumpsys", "gpu").redirectErrorStream(true).start();
                final Process proc = p;
                Thread killer = new Thread(() -> {
                    try {
                        if (!proc.waitFor(8, TimeUnit.SECONDS)) proc.destroyForcibly();
                    } catch (InterruptedException ignored) {}
                }, "dumpsys-timeout");
                killer.setDaemon(true);
                killer.start();
                String out = new String(readAll(p.getInputStream()), StandardCharsets.UTF_8);
                p.waitFor();
                killer.interrupt();
                for (String line : out.split("\n")) {
                    String t = line.trim();
                    if (t.startsWith("Global total:")) {
                        s.bytes = Long.parseLong(t.substring("Global total:".length()).trim());
                        s.atMs = System.currentTimeMillis();
                        return s;
                    }
                }
                s.error = "`dumpsys gpu` output has no 'Global total:' line";
            } catch (IOException | NumberFormatException e) {
                s.error = "`dumpsys gpu` failed: " + e.getMessage();
            } catch (InterruptedException e) {
                s.error = "`dumpsys gpu` interrupted";
            } finally {
                if (p != null) p.destroy();
            }
            return s;
        }
    }

    // ------------------------------------------------------------------------------------
    // TPU
    // ------------------------------------------------------------------------------------

    /**
     * Establishes, with a live perfetto session, whether edgetpu ftrace events can be recorded.
     * On the Pixel 11 Pro they cannot: perfetto reports every edgetpu event in
     * FtraceStats.unknown_ftrace_events (identical to a non-existent event), and the shell uid
     * cannot read or write the events/edgetpu/* files. perfetto's proto tree also has no
     * edgetpu event message. Hence no TPU utilization is derived or served; this class only
     * produces the stated reason.
     */
    static final class TpuProbe {
        private static final String PROBE_TRACE = "/data/misc/perfetto-traces/pixelkit-sysmetrics-probe.pftrace";
        private static final String[] EDGETPU_EVENTS = {
            "edgetpu_vii_command_start", "edgetpu_vii_command_end",
            "edgetpu_kci_command_start", "edgetpu_kci_command_end", "edgetpu_power_state"
        };
        private static final String PROBE_CONFIG;
        static {
            StringBuilder c = new StringBuilder("buffers { size_kb: 1024 fill_policy: RING_BUFFER }\n"
                    + "data_sources { config { name: \"linux.ftrace\" ftrace_config {\n");
            for (String e : EDGETPU_EVENTS) c.append("ftrace_events: \"edgetpu/").append(e).append("\"\n");
            c.append("}}}\nduration_ms: 500\n");
            PROBE_CONFIG = c.toString();
        }

        private volatile String reason = "tpu probe has not completed yet";
        private volatile Process running = null;
        private volatile boolean stopped = false;

        String reason() {
            return reason;
        }

        void start() {
            Thread t = new Thread(() -> {
                while (!stopped) {
                    reason = probe();
                    try {
                        Thread.sleep(TPU_REPROBE_MS);
                    } catch (InterruptedException e) {
                        return;
                    }
                }
            }, "tpu-probe");
            t.setDaemon(true);
            t.start();
        }

        void stop() {
            stopped = true;
            Process p = running;
            if (p != null) p.destroyForcibly();
            new File(PROBE_TRACE).delete();
        }

        private String probe() {
            String enableAccess = describeAccess(TRACEFS + "/events/edgetpu/edgetpu_vii_command_start/enable");
            String perfetto;
            try {
                perfetto = runPerfettoProbe();
            } catch (Exception e) {
                perfetto = "perfetto probe failed: " + e.getMessage();
            }
            return "no TPU utilization source is readable by uid " + android.os.Process.myUid()
                    + ". " + perfetto + ". " + enableAccess;
        }

        private static String describeAccess(String path) {
            try (InputStream in = new FileInputStream(path)) {
                return path + " is readable (no decoder for edgetpu events is implemented)";
            } catch (IOException e) {
                return path + " cannot be opened: " + e.getMessage();
            }
        }

        private String runPerfettoProbe() throws Exception {
            new File(PROBE_TRACE).delete();
            Process p = new ProcessBuilder("/system/bin/perfetto", "--txt", "-c", "-", "-o", PROBE_TRACE)
                    .redirectErrorStream(true).start();
            running = p;
            try {
                try (OutputStream os = p.getOutputStream()) {
                    os.write(PROBE_CONFIG.getBytes(StandardCharsets.US_ASCII));
                }
                Thread drain = new Thread(() -> {
                    try { readAll(p.getInputStream()); } catch (IOException ignored) {}
                }, "perfetto-drain");
                drain.setDaemon(true);
                drain.start();
                if (!p.waitFor(20, TimeUnit.SECONDS)) {
                    p.destroyForcibly();
                    return "perfetto probe timed out after 20 s";
                }
                if (p.exitValue() != 0) return "perfetto probe exited with code " + p.exitValue();
                byte[] trace = readAll(new FileInputStream(PROBE_TRACE));
                List<String> rejected = rejectedEvents(trace);
                if (rejected.isEmpty()) {
                    return "perfetto accepted the edgetpu ftrace events but this daemon has no verified decoder for them";
                }
                return "perfetto cannot record edgetpu ftrace events: FtraceStats.unknown_ftrace_events/failed_ftrace_events = "
                        + rejected;
            } finally {
                running = null;
                new File(PROBE_TRACE).delete();
            }
        }

        /** Trace.packet(1) -> TracePacket.ftrace_stats(34) -> FtraceStats.unknown(6)/failed(7) event names. */
        static List<String> rejectedEvents(byte[] trace) {
            List<String> out = new ArrayList<>();
            Proto packets = new Proto(trace, 0, trace.length);
            while (packets.next()) {
                if (packets.field != 1 || packets.wire != 2) continue;
                Proto packet = new Proto(trace, packets.dataStart, packets.dataEnd);
                while (packet.next()) {
                    if (packet.field != 34 || packet.wire != 2) continue;
                    Proto stats = new Proto(trace, packet.dataStart, packet.dataEnd);
                    while (stats.next()) {
                        if ((stats.field == 6 || stats.field == 7) && stats.wire == 2) {
                            String name = new String(trace, stats.dataStart, stats.dataEnd - stats.dataStart, StandardCharsets.UTF_8);
                            if (!out.contains(name)) out.add(name);
                        }
                    }
                }
            }
            return out;
        }
    }

    /** Minimal protobuf field walker: iterates (field number, wire type, length-delimited bounds). */
    static final class Proto {
        private final byte[] buf;
        private int pos;
        private final int end;
        int field;
        int wire;
        long varint;
        int dataStart;
        int dataEnd;

        Proto(byte[] buf, int start, int end) {
            this.buf = buf;
            this.pos = start;
            this.end = end;
        }

        /** Advances to the next field; false at the end or on malformed data. */
        boolean next() {
            if (pos >= end) return false;
            long tag = readVarint();
            if (tag < 0) return false;
            field = (int) (tag >>> 3);
            wire = (int) (tag & 7);
            switch (wire) {
                case 0:
                    varint = readVarint();
                    return pos <= end;
                case 1:
                    pos += 8;
                    return pos <= end;
                case 2: {
                    long len = readVarint();
                    if (len < 0 || pos + len > end) return false;
                    dataStart = pos;
                    dataEnd = pos + (int) len;
                    pos = dataEnd;
                    return true;
                }
                case 5:
                    pos += 4;
                    return pos <= end;
                default:
                    return false; // groups are not used by perfetto protos
            }
        }

        private long readVarint() {
            long result = 0;
            int shift = 0;
            while (pos < end && shift < 64) {
                int b = buf[pos++] & 0xff;
                result |= (long) (b & 0x7f) << shift;
                if ((b & 0x80) == 0) return result;
                shift += 7;
            }
            return -1;
        }
    }

    // ------------------------------------------------------------------------------------
    // HTTP
    // ------------------------------------------------------------------------------------

    private static void handleClient(Socket socket) {
        try {
            socket.setSoTimeout(2000);
            InputStream in = socket.getInputStream();
            OutputStream out = socket.getOutputStream();
            String requestLine = readLine(in);
            if (requestLine == null || requestLine.isEmpty()) return;
            String line;
            while ((line = readLine(in)) != null && !line.isEmpty()) {
                // headers are not needed
            }
            String[] parts = requestLine.split(" ");
            String method = parts.length > 0 ? parts[0].toUpperCase(Locale.ROOT) : "";
            String path = parts.length > 1 ? parts[1] : "/";
            int q = path.indexOf('?');
            if (q >= 0) path = path.substring(0, q);

            int status = 200;
            String body;
            if (!method.equals("GET")) {
                status = 405;
                body = "{\"error\":\"Method Not Allowed\"}";
            } else if (path.equals("/ping")) {
                body = "{\"ok\":true,\"version\":" + str(VERSION) + ",\"uid\":" + android.os.Process.myUid() + "}";
            } else if (path.equals("/metrics")) {
                String latest = latestMetricsJson;
                if (latest == null) {
                    status = 503;
                    body = "{\"error\":\"no completed sampling window yet\"}";
                } else {
                    body = latest;
                }
            } else {
                status = 404;
                body = "{\"error\":\"Not Found\"}";
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            String statusText = status == 200 ? "OK" : status == 404 ? "Not Found" : status == 405 ? "Method Not Allowed" : "Service Unavailable";
            String header = "HTTP/1.1 " + status + " " + statusText + "\r\n"
                    + "Content-Type: application/json; charset=utf-8\r\n"
                    + "Content-Length: " + bytes.length + "\r\n"
                    + "Cache-Control: no-store\r\n"
                    + "Connection: close\r\n\r\n";
            out.write(header.getBytes(StandardCharsets.US_ASCII));
            out.write(bytes);
            out.flush();
        } catch (IOException ignored) {
            // client went away or timed out
        } finally {
            try { socket.close(); } catch (IOException ignored) {}
        }
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream(128);
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') buf.write(c);
            if (buf.size() > 8192) throw new IOException("request line too long");
        }
        if (c == -1 && buf.size() == 0) return null;
        return new String(buf.toByteArray(), StandardCharsets.ISO_8859_1);
    }

    // ------------------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------------------

    private static byte[] readAll(InputStream in) throws IOException {
        try (InputStream is = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream(4096);
            byte[] b = new byte[8192];
            int n;
            while ((n = is.read(b)) > 0) out.write(b, 0, n);
            return out.toByteArray();
        }
    }

    private static void writeFile(String path, String content) throws IOException {
        try (FileOutputStream os = new FileOutputStream(path)) {
            os.write(content.getBytes(StandardCharsets.US_ASCII));
        }
    }

    private static Long readLongFile(String path) {
        try {
            return Long.parseLong(new String(readAll(new FileInputStream(path)), StandardCharsets.US_ASCII).trim());
        } catch (IOException | NumberFormatException e) {
            return null;
        }
    }

    private static double clampPercent(double v) {
        if (v < 0) return 0;
        if (v > 100) return 100;
        return v;
    }

    private static String num(Double v) {
        if (v == null || v.isNaN() || v.isInfinite()) return "null";
        return String.format(Locale.US, "%.2f", v);
    }

    private static String str(String s) {
        StringBuilder sb = new StringBuilder(s.length() + 2).append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.append('"').toString();
    }
}
