package expo.modules.pixelnative

import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ProfilingManager
import android.os.ProfilingResult
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import java.util.function.Consumer

/** What ProfilingManager delivered for one request: copied out so no API 35 type is held in fields. */
private data class ProfilingOutcome(val errorCode: Int, val errorMessage: String?, val path: String?)

private data class PerfettoVersionProbe(val version: String?, val reason: String?)

/**
 * System trace sessions for the app process. Two real backends, nothing simulated:
 *
 *  - `profiling_manager`: `android.os.ProfilingManager` system-trace request (Android 15, API 35+).
 *    The platform records a Perfetto trace of this app and delivers the file path to a callback
 *    after the CancellationSignal fires. The platform picks the data sources, so the requested
 *    category list cannot be applied and is reported as not applied.
 *  - `perfetto_binary`: spawns `/system/bin/perfetto` with the requested atrace categories. Used
 *    only when ProfilingManager is absent and the binary can be executed by the app. Many devices
 *    refuse the exec for app processes; the failure text is returned instead of a success.
 *
 * `stop` reports the trace file only when it exists on disk with a non-zero length.
 */
internal class PerfettoTraceController(private val context: Context) {
  private companion object {
    const val PERFETTO_BINARY = "/system/bin/perfetto"
    const val BACKEND_PROFILING_MANAGER = "profiling_manager"
    const val BACKEND_BINARY = "perfetto_binary"
    const val EARLY_FAILURE_WINDOW_MS = 1_500L
    const val RESULT_TIMEOUT_MS = 10_000L
    const val VERSION_PROBE_TIMEOUT_MS = 1_500L
    const val BINARY_TRACE_MAX_SECONDS = 600
    val DEFAULT_CATEGORIES = listOf("sched", "freq", "idle", "gfx", "view", "am", "wm", "power", "thermal")

    /** atrace category names the perfetto command line accepts; not verified per device. */
    val BINARY_CATEGORIES = listOf("sched", "freq", "idle", "gfx", "view", "am", "wm", "camera", "hal", "power", "thermal", "aidl")
  }

  private val lock = Any()
  private var backend: String? = null
  private var activeCategories: List<String> = emptyList()
  private var signal: CancellationSignal? = null
  private var profilingOutcome: AtomicReference<ProfilingOutcome?> = AtomicReference(null)
  private var profilingLatch: CountDownLatch = CountDownLatch(0)
  private var process: Process? = null
  private var processLog: File? = null
  private var traceFile: File? = null
  private var versionProbe: PerfettoVersionProbe? = null
  private val executor = Executors.newSingleThreadExecutor()

  private fun profilingManager(): ProfilingManager? =
    if (Build.VERSION.SDK_INT >= 35) context.getSystemService(ProfilingManager::class.java) else null

  private fun probeVersion(): PerfettoVersionProbe {
    synchronized(lock) { versionProbe?.let { return it } }
    val probe = runVersionProbe()
    synchronized(lock) { versionProbe = probe }
    return probe
  }

  private fun runVersionProbe(): PerfettoVersionProbe {
    if (!File(PERFETTO_BINARY).exists()) {
      return PerfettoVersionProbe(null, "$PERFETTO_BINARY is not visible to this app process")
    }
    return try {
      val p = ProcessBuilder(PERFETTO_BINARY, "--version").redirectErrorStream(true).start()
      if (!p.waitFor(VERSION_PROBE_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
        p.destroyForcibly()
        return PerfettoVersionProbe(null, "perfetto --version did not exit within $VERSION_PROBE_TIMEOUT_MS ms")
      }
      val out = p.inputStream.bufferedReader().readText().trim()
      if (p.exitValue() != 0) {
        return PerfettoVersionProbe(null, "perfetto --version exited ${p.exitValue()}: ${out.take(200)}")
      }
      val match = Regex("""v\d+(?:\.\d+)+[^\s,)]*""").find(out)
      if (match != null) PerfettoVersionProbe(match.value, null)
      else PerfettoVersionProbe(null, "unrecognised perfetto --version output: ${out.take(200)}")
    } catch (e: Throwable) {
      PerfettoVersionProbe(null, "cannot execute $PERFETTO_BINARY from the app process: ${e.message ?: e.javaClass.simpleName}")
    }
  }

  private fun sessionRunning(): Boolean = synchronized(lock) {
    when (backend) {
      BACKEND_PROFILING_MANAGER -> profilingOutcome.get() == null
      BACKEND_BINARY -> process?.isAlive == true
      else -> false
    }
  }

  fun info(): Map<String, Any?> {
    val probe = probeVersion()
    val pmAvailable = profilingManager() != null
    val binaryRunnable = probe.version != null
    val usable = pmAvailable || binaryRunnable
    return mapOf(
      "isSupported" to usable,
      "perfettoVersion" to probe.version,
      "perfettoVersionReason" to probe.reason,
      "availableCategories" to (if (!pmAvailable && binaryRunnable) BINARY_CATEGORIES else emptyList()),
      "isTracing" to sessionRunning(),
      "backend" to (if (pmAvailable) BACKEND_PROFILING_MANAGER else if (binaryRunnable) BACKEND_BINARY else null),
      "error" to (if (usable) null else "No system trace backend: ProfilingManager needs Android 15 (API 35); ${probe.reason}"),
    )
  }

  private fun startResult(started: Boolean, backend: String?, categories: List<String>, applied: Boolean, error: String?): Map<String, Any?> = mapOf(
    "started" to started,
    "backend" to backend,
    "activeCategories" to categories,
    "categoriesApplied" to applied,
    "error" to error,
  )

  fun start(categories: List<String>?, bufferSizeKb: Int?): Map<String, Any?> {
    synchronized(lock) {
      if (backend != null) {
        return startResult(false, backend, activeCategories, activeCategories.isNotEmpty(), "A trace session is already active; stop it first")
      }
    }
    val pm = profilingManager()
    return if (pm != null) startProfiling(pm, bufferSizeKb) else startBinary(categories, bufferSizeKb)
  }

  private fun profilingErrorName(code: Int): String = when (code) {
    ProfilingResult.ERROR_NONE -> "ERROR_NONE"
    ProfilingResult.ERROR_FAILED_EXECUTING -> "ERROR_FAILED_EXECUTING"
    ProfilingResult.ERROR_FAILED_INVALID_REQUEST -> "ERROR_FAILED_INVALID_REQUEST"
    ProfilingResult.ERROR_FAILED_NO_DISK_SPACE -> "ERROR_FAILED_NO_DISK_SPACE"
    ProfilingResult.ERROR_FAILED_POST_PROCESSING -> "ERROR_FAILED_POST_PROCESSING"
    ProfilingResult.ERROR_FAILED_PROFILING_IN_PROGRESS -> "ERROR_FAILED_PROFILING_IN_PROGRESS"
    ProfilingResult.ERROR_FAILED_RATE_LIMIT_PROCESS -> "ERROR_FAILED_RATE_LIMIT_PROCESS"
    ProfilingResult.ERROR_FAILED_RATE_LIMIT_SYSTEM -> "ERROR_FAILED_RATE_LIMIT_SYSTEM"
    else -> "ERROR_UNKNOWN($code)"
  }

  private fun describe(o: ProfilingOutcome): String =
    "ProfilingManager ${profilingErrorName(o.errorCode)}${o.errorMessage?.let { ": $it" } ?: ""}"

  private fun startProfiling(pm: ProfilingManager, bufferSizeKb: Int?): Map<String, Any?> {
    val cancel = CancellationSignal()
    val outcome = AtomicReference<ProfilingOutcome?>(null)
    val latch = CountDownLatch(1)
    // Parameter keys are the ones the AndroidX Profiling wrapper writes into the request bundle.
    val params = Bundle().apply { if (bufferSizeKb != null) putInt("KEY_SIZE_KB", bufferSizeKb) }
    val consumer = Consumer<ProfilingResult> { r ->
      outcome.set(ProfilingOutcome(r.errorCode, r.errorMessage, r.resultFilePath))
      latch.countDown()
    }
    try {
      pm.requestProfiling(ProfilingManager.PROFILING_TYPE_SYSTEM_TRACE, params, "pixelkit", cancel, executor, consumer)
    } catch (e: Throwable) {
      return startResult(false, BACKEND_PROFILING_MANAGER, emptyList(), false, "ProfilingManager.requestProfiling threw: ${e.message ?: e.javaClass.simpleName}")
    }
    // ProfilingManager has no "started" callback. A rejected request (rate limit, request already in
    // progress, invalid parameters) reports through the result callback almost immediately; a result
    // before cancellation therefore means the request failed.
    if (latch.await(EARLY_FAILURE_WINDOW_MS, TimeUnit.MILLISECONDS)) {
      val early = outcome.get()
      val reason = if (early != null && early.errorCode != ProfilingResult.ERROR_NONE) describe(early)
      else "ProfilingManager ended the trace before it was stopped"
      return startResult(false, BACKEND_PROFILING_MANAGER, emptyList(), false, reason)
    }
    synchronized(lock) {
      backend = BACKEND_PROFILING_MANAGER
      activeCategories = emptyList()
      signal = cancel
      profilingOutcome = outcome
      profilingLatch = latch
    }
    return startResult(true, BACKEND_PROFILING_MANAGER, emptyList(), false, null)
  }

  private fun startBinary(categories: List<String>?, bufferSizeKb: Int?): Map<String, Any?> {
    val probe = probeVersion()
    if (probe.version == null) {
      return startResult(false, null, emptyList(), false, "No trace backend: ProfilingManager needs Android 15 (API 35); ${probe.reason}")
    }
    val dir = File(context.cacheDir, "traces").apply { mkdirs() }
    val stamp = System.currentTimeMillis()
    val file = File(dir, "pixelkit_trace_$stamp.perfetto-trace")
    val log = File(dir, "pixelkit_trace_$stamp.log")
    val cats = if (categories.isNullOrEmpty()) DEFAULT_CATEGORIES else categories
    val cmd = mutableListOf(
      PERFETTO_BINARY, "-o", file.absolutePath, "-b", "${bufferSizeKb ?: 16384}kb", "-t", "${BINARY_TRACE_MAX_SECONDS}s",
    ) + cats
    val p = try {
      ProcessBuilder(cmd).redirectErrorStream(true).redirectOutput(log).start()
    } catch (e: Throwable) {
      return startResult(false, BACKEND_BINARY, emptyList(), false, "cannot execute $PERFETTO_BINARY: ${e.message ?: e.javaClass.simpleName}")
    }
    if (p.waitFor(EARLY_FAILURE_WINDOW_MS, TimeUnit.MILLISECONDS)) {
      return startResult(false, BACKEND_BINARY, emptyList(), false, "perfetto exited ${p.exitValue()} immediately: ${tail(log)}")
    }
    synchronized(lock) {
      backend = BACKEND_BINARY
      activeCategories = cats
      process = p
      processLog = log
      traceFile = file
    }
    return startResult(true, BACKEND_BINARY, cats, true, null)
  }

  private fun tail(file: File?): String =
    try { file?.readText()?.trim()?.takeLast(300).orEmpty() } catch (_: Throwable) { "" }

  private fun stopResult(stopped: Boolean, path: String?, sizeBytes: Long?, error: String?): Map<String, Any?> = mapOf(
    "stopped" to stopped,
    "path" to path,
    "sizeBytes" to sizeBytes,
    "error" to error,
  )

  /** Verifies the trace file exists with a non-zero length before reporting a path. */
  private fun verifyFile(file: File?, what: String): Map<String, Any?> {
    if (file == null) return stopResult(true, null, null, "$what reported no trace file path")
    if (!file.exists()) return stopResult(true, null, null, "Trace file does not exist: ${file.absolutePath}")
    val size = file.length()
    if (size <= 0L) return stopResult(true, null, 0L, "Trace file is empty: ${file.absolutePath}")
    return stopResult(true, file.absolutePath, size, null)
  }

  fun stop(): Map<String, Any?> {
    val current: String?
    val cancel: CancellationSignal?
    val outcome: AtomicReference<ProfilingOutcome?>
    val latch: CountDownLatch
    val proc: Process?
    val log: File?
    val file: File?
    synchronized(lock) {
      current = backend
      cancel = signal
      outcome = profilingOutcome
      latch = profilingLatch
      proc = process
      log = processLog
      file = traceFile
      backend = null
      activeCategories = emptyList()
      signal = null
      process = null
      processLog = null
      traceFile = null
    }
    return when (current) {
      BACKEND_PROFILING_MANAGER -> {
        if (outcome.get() == null) cancel?.cancel()
        if (!latch.await(RESULT_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
          return stopResult(false, null, null, "ProfilingManager delivered no result within $RESULT_TIMEOUT_MS ms after the trace was stopped")
        }
        val o = outcome.get() ?: return stopResult(false, null, null, "ProfilingManager result callback carried no result")
        if (o.errorCode != ProfilingResult.ERROR_NONE) stopResult(false, null, null, describe(o))
        else verifyFile(o.path?.let { File(it) }, "ProfilingManager")
      }
      BACKEND_BINARY -> {
        if (proc != null) {
          if (proc.isAlive) {
            proc.destroy()
            if (!proc.waitFor(5, TimeUnit.SECONDS)) proc.destroyForcibly()
          }
        }
        val result = verifyFile(file, "perfetto")
        if (result["path"] == null && result["error"] != null) {
          val logTail = tail(log)
          if (logTail.isNotEmpty()) stopResult(true, null, result["sizeBytes"] as? Long, "${result["error"]} (perfetto output: $logTail)") else result
        } else result
      }
      else -> stopResult(false, null, null, "No trace session is running")
    }
  }

  fun release() {
    synchronized(lock) {
      signal?.cancel()
      process?.destroyForcibly()
      backend = null
      signal = null
      process = null
    }
    executor.shutdown()
  }
}
