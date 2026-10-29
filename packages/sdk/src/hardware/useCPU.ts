/**
 * @file useCPU.ts
 * @description Real CPU telemetry from the Android kernel: core count, per-core part ids from
 * `/proc/cpuinfo`, current/max frequencies from cpufreq sysfs, the active governor, and two load
 * signals: this app's own CPU share (`Process.getElapsedCpuTime`) and cluster frequency utilisation
 * (current/max frequency averaged across cores). Android does not expose whole-system `/proc/stat`
 * to apps, so there is no fabricated "system load" here; `useSystemLoad` reads it through the ADB daemon.
 */

import { useCallback, useEffect, useState } from 'react';
import PixelNative, { type CpuInfo, type CpuLoad } from '@pixelkit-labs/native';
import { logEvent, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useCPU';
const POLL_MS = 1000;

function topologyString(info: CpuInfo | null): string {
  if (!info) return 'unknown';
  return [...info.clusters]
    .sort((a, b) => (b.maxMHz ?? 0) - (a.maxMHz ?? 0))
    .map(c => `${c.count}x ${c.name ?? 'Arm'} @ ${c.maxMHz ? (c.maxMHz / 1000).toFixed(2) + ' GHz' : '?'}`)
    .join(' + ');
}

/**
 * Hook exposing real CPU topology, frequencies, and load.
 *
 * @example
 * ```typescript
 * const { coreCount, coreTopology, cpuLoadPercent, cores, benchmarkCPU } = useCPU();
 * ```
 */
export function useCPU() {
  const [info, setInfo] = useState<CpuInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [load, setLoad] = useState<CpuLoad | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);
  const [lastBenchmarkDurationMs, setLastBenchmarkDurationMs] = useState<number | null>(null);

  const source: TelemetrySource = PixelNative ? 'hardware' : 'unavailable';

  useEffect(() => {
    const native = PixelNative;
    if (!native) { logEvent(MODULE, 'native module absent; CPU telemetry unavailable', undefined, 'warn'); return; }
    try {
      const i = native.getCpuInfo();
      setInfo(i);
      logEvent(MODULE, 'topology', { coreCount: i.coreCount, clusters: i.clusters, governor: i.governor });
    } catch (e: any) { setError(e?.message ?? 'getCpuInfo error');
      logEvent(MODULE, 'getCpuInfo error', { message: e?.message }, 'error'); }
    const poll = () => {
      try {
        const l = native.getCpuLoad();
        setLoad(l);
        recordMetric(MODULE, 'frequencyUtilizationPercent', l.frequencyUtilizationPercent, l.frequencyUtilizationPercent == null ? 'unavailable' : 'hardware');
        recordMetric(MODULE, 'appCpuPercent', l.appCpuPercent, l.appCpuPercent == null ? 'unavailable' : 'derived');
      } catch (e: any) { setError(e?.message ?? 'getCpuLoad error');
      logEvent(MODULE, 'getCpuLoad error', { message: e?.message }, 'error'); }
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, []);

  /** Single-thread JS prime sieve. A real workload on the JS thread; not a system benchmark. */
  const benchmarkCPU = useCallback(async (): Promise<number> => {
    setIsBenchmarking(true);
    await new Promise(r => setTimeout(r, 30)); // let the UI paint the pending state
    const start = performance.now();
    let primes = 0;
    for (let i = 2; i <= 60000; i++) {
      let p = true;
      for (let j = 2; j * j <= i; j++) if (i % j === 0) { p = false; break; }
      if (p) primes++;
    }
    const ms = Math.round(performance.now() - start);
    setLastBenchmarkDurationMs(ms);
    setIsBenchmarking(false);
    logEvent(MODULE, 'benchmark', { ms, primes });
    return ms;
  }, []);

  const utilization = load?.frequencyUtilizationPercent ?? null;

  return {
    /** Human topology string built from real cluster data, e.g. "1x Arm C1-Ultra @ 4.11 GHz + ..." */
    coreTopology: topologyString(info),
    coreCount: info?.coreCount ?? 0,
    /** Cluster-frequency utilisation in percent (avg of cur/max over cores). null when sysfs is unreadable. */
    cpuLoadPercent: utilization == null ? null : Math.round(utilization),
    /** This app process's CPU share in percent of all cores. null on the first sample. */
    appCpuPercent: load?.appCpuPercent == null ? null : Math.round(load.appCpuPercent),
    /** Per-core current/max MHz and part name */
    cores: load?.cores ?? info?.cores ?? [],
    clusters: info?.clusters ?? [],
    /** Kernel cpufreq governor for cpu0 (e.g. "schedutil"). Not settable without root. */
    governorMode: info?.governor ?? 'unknown',
    lastBenchmarkDurationMs,
    isBenchmarking,
    benchmarkCPU,
    /** Latest failure message, or null. Failures are also logged and counted. */
    error,
    /** Telemetry provenance */
    source,
  };
}
