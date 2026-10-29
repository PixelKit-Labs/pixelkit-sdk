# PixelKit System Metrics Daemon

Zero-dependency Java daemon that exposes real CPU and GPU load (and an honest TPU status) on
`http://127.0.0.1:11081`. It runs as uid 2000 (`shell`) through `app_process`, the same way the
HiLight daemon does, because the shell uid can read `/proc/stat` (denied to apps) and can write the
tracefs power events that report GPU work. The SDK hook `useSystemLoad()` polls it.

Nothing is simulated. Every section carries `source: "hardware" | "derived" | "unavailable"`; a value
that cannot be read is `null` with the reason in `error`.

## Build and run

```powershell
# build only: javac -> d8 -> scripts/system-metrics-daemon/system-metrics-daemon.jar
powershell -File scripts/system-metrics-daemon/build.ps1

# build if needed, push to /data/local/tmp, stop a prior instance, launch, forward port 11081,
# then print GET /ping and GET /metrics
powershell -File scripts/system-metrics-daemon/run.ps1 [-Serial <adb serial>] [-Rebuild]

# stop (tracefs is restored automatically, see below)
adb shell "pkill -f com.pixelkit.sysmetrics.SystemMetricsDaemon"
```

`ANDROID_HOME` (default `%LOCALAPPDATA%\Android\Sdk`) must contain `platforms\android-37.0` or
`android-36` and a `build-tools\*\d8.bat`. Device log: `/data/local/tmp/system-metrics-daemon.log`.
The daemon does not survive a reboot; start it again with `run.ps1`.

## Endpoints

- `GET /ping` -> `{"ok":true,"version":"1.0.0","uid":2000}`
- `GET /metrics` -> the latest completed sampling window (about 1 s). `503` until the first window
  completes (about 1.5 s after launch).

```json
{
  "version": "1.0.0", "uid": 2000, "sampledAtMs": 1793258226577, "windowMs": 1008,
  "cpu": { "source": "hardware", "error": null, "utilizationPercent": 3.0,
           "perCorePercent": [4.0, 4.0, 0.0, 0.0, 1.0, 0.99, 0.0] },
  "gpu": { "source": "derived", "error": null, "utilizationPercent": 43.58, "frequencyHz": 1286000000,
           "memoryUsedBytes": 606420992, "topProcesses": [{ "uid": 2000, "activePercent": 43.58 }] },
  "tpu": { "source": "unavailable", "error": "...", "utilizationPercent": null, "powerState": null }
}
```

Percentages are 0-100, clamped. `windowMs` is the measured wall time of the window.

## Sources

| Section | Source | Notes |
| --- | --- | --- |
| `cpu` | `/proc/stat` jiffy deltas | `(total - idle - iowait) / total` for the system line and each `cpuN` line. An offline core (no jiffies in the window) is `null`. |
| `gpu.utilizationPercent`, `gpu.topProcesses` | tracefs `power/gpu_work_period`, read from `trace_pipe` | Sum of `total_active_duration_ns` over all uids divided by the window. `derived`, because the ratio is computed from hardware-reported busy time. Events are attributed to the window in which they are read. Top 5 uids by active time. |
| `gpu.frequencyHz` | tracefs `power/gpu_frequency` (last `state=`); before the first event, `/sys/class/devfreq/34f00000.gpu0/cur_freq` | `0` means the GPU was powered down at the last frequency event. |
| `gpu.memoryUsedBytes` | `dumpsys gpu` "Global total:" | Polled every 5 s; `null` if the last good value is older than 15 s. |
| `tpu` | none | See below. |

When the work-period trace cannot be used (pipe unreadable, event switched off by another tracer,
`tracing_on=0`), `gpu.utilizationPercent` is `null` with the exact error, and `gpu.source` is
`"hardware"` if frequency or memory could still be read, else `"unavailable"`. A GPU with no work in
the window reports `0`, because the kernel emits `gpu_work_period` only for uids that used the GPU.

## TPU: not available, by measurement

On the Pixel 11 Pro (build CD1A.261005.003) no TPU utilization source is reachable from the shell uid:

- `/sys/kernel/tracing/events/edgetpu/*` cannot be opened by shell (SELinux, `EACCES`), so the
  `edgetpu_vii_command_start/end` events cannot be enabled or read through `trace_pipe`.
- `perfetto` (shell can run it) accepts a `linux.ftrace` config listing those events but reports every
  `edgetpu/*` event in `FtraceStats.unknown_ftrace_events`, exactly like a non-existent event such as
  `edgetpu/not_a_real_event`, while `power/gpu_work_period` is accepted. So perfetto records no edgetpu
  events either. perfetto's `protos/perfetto/trace/ftrace` tree also has no edgetpu event message.
- `/sys/class/devfreq/36558000.santafe`, `/sys/class/edgetpu/*` and the santafe `power/runtime_*`
  files are denied to shell.

The daemon therefore serves `tpu.source = "unavailable"` with `utilizationPercent` and `powerState`
`null`. The `error` text is produced live: at startup (and every 30 minutes) the daemon runs a 0.5 s
perfetto session that lists the edgetpu events, decodes `FtraceStats` from the resulting trace with a
small protobuf walker, and reports the events perfetto rejected plus the `open()` error on the
edgetpu enable file. If a future build lets perfetto accept the events, the text changes to say so, but
no TPU number is served until a decoder verified against real command events exists. Live TPU activity
was never observed, so no decoder was written.

## Shared tracefs: what the daemon changes and restores

The daemon writes `1` to `events/power/gpu_work_period/enable` and `events/power/gpu_frequency/enable`
and reads the global `trace_pipe`.

- Before enabling, it records the original values in `/data/local/tmp/pixelkit-sysmetrics.state`.
  A leftover state file (previous instance killed with SIGKILL before cleanup) takes precedence over the
  current values, so an old `1` is never mistaken for the original.
- ART does not run Java shutdown hooks on SIGTERM/SIGKILL. A detached `sh` watchdog started by the
  daemon waits for the daemon pid to disappear and then restores both enables and deletes the state
  file. A clean `System.exit` runs the shutdown hook, which restores first and deletes the state file,
  so the watchdog does nothing.
- Every window the daemon re-reads both enables and `tracing_on`. If another tracer switched an event
  off, the daemon re-enables it and withholds that window's GPU utilization (`error` explains why).
- `trace_pipe` is a consuming read of the global buffer. A concurrent perfetto session on the main
  tracefs instance (default config) and this daemon each see only a subset of the events, and the end
  of a perfetto session writes `0` to the enables. Do not record GPU traces with perfetto while the
  daemon runs; stop the daemon first. The shell uid cannot create a private tracefs instance
  (`/sys/kernel/tracing/instances` is not writable), so this cannot be avoided.

## Verification evidence (Pixel 11 Pro, wireless adb)

- CPU: three pinned busy loops, independent `/proc/stat` delta over 5 s = 44.01 %; daemon windows
  41.5-45.5 %.
- GPU: an offscreen GLES load run as shell uid 2000 (100 ms busy / 100 ms idle, 6 s). The daemon
  summed 2747 ms of active time over the run, all attributed to uid 2000; a separate perfetto +
  trace_processor capture (daemon stopped) of the same load summed 2740 ms.
- GPU memory equals `dumpsys gpu` "Global total" (601698304 bytes at the time of check).
- After `pkill`, both tracefs enables read `0` again and the state file is gone.
- Daemon cost at idle: about 0.5 % of one core for the daemon process plus about 0.7 % for the
  `dumpsys gpu` children it spawns every 5 s (measured over 30 s); resident set about 130 MB (ART).
