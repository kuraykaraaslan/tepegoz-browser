import { app } from 'electron';
import { Logger } from '@tepegoz/libs';
import {
  cpuSecondsDelta,
  emptyRunResourceAccumulator,
  foldRunResourceSample,
  type RunResourceAccumulator,
} from '@tepegoz/tab-engine';
import { runWorkingTabPid } from './browser-host.electron';

/**
 * Electron-side glue for S7 PR6 "Resource accounting per run" — attaches peak RSS + CPU-seconds to
 * ONE agent run's lifetime, reusing the Task Manager's own `app.getAppMetrics()` source
 * (`process-metrics.electron.ts`) rather than a second way to read process resource usage. The
 * arithmetic itself lives in `@tepegoz/tab-engine`'s `run-resource-metrics.ts` (Electron-free, unit
 * tested); this file only samples and calls it.
 *
 * **Idle cost is zero, by construction.** There is no interval timer here — `startRunResourceTracking`
 * is called once when a run starts, `sampleRunResource` only from inside the run's OWN step-transition
 * events (see `ipc-agent-run.ts`'s `onEvent`), and `finishRunResourceTracking` once when the run ends.
 * A run that produces zero step events samples zero times; an app with no run active never calls any of
 * these three functions at all.
 */

export interface RunResourceTrackerState {
  cpuBaselineMicros: { userCPUTime: number; systemCPUTime: number };
  acc: RunResourceAccumulator;
}

export interface RunResourceUsage {
  peakRssBytes: number;
  cpuSeconds: number;
}

/** Start tracking one run: a single `process.resourceUsage()` snapshot (main process, cumulative since
 *  process start) — cheap, and not itself a form of polling. */
export function startRunResourceTracking(): RunResourceTrackerState {
  const cpu = process.resourceUsage();
  return {
    cpuBaselineMicros: { userCPUTime: cpu.userCPUTime, systemCPUTime: cpu.systemCPUTime },
    acc: emptyRunResourceAccumulator(),
  };
}

/**
 * Fold one resource snapshot into the tracker. Attributes the sample to the main process (constant,
 * `process.pid`) plus the run's CURRENT working-tab renderer, resolved via `runWorkingTabPid()` — the
 * exact tab-to-process latch `runActiveTabUrl` already uses for the Policy Kernel's site context, so a
 * run that switches tabs mid-run is attributed to whichever renderer it is actually driving at each
 * sample, not a pid fixed at run start.
 *
 * Must be called only while a run is active (see the module doc) — never on an interval.
 */
export function sampleRunResource(state: RunResourceTrackerState): void {
  try {
    const metrics = app
      .getAppMetrics()
      .map((m) => ({ pid: m.pid, workingSetKb: m.memory.workingSetSize }));
    const tabPid = runWorkingTabPid();
    const pids = tabPid === null ? [process.pid] : [process.pid, tabPid];
    state.acc = foldRunResourceSample(state.acc, { pids, metrics });
  } catch (err) {
    // Telemetry must never break a run: a failed sample is simply skipped.
    Logger.warn('Run resource sample failed', { err: String(err) });
  }
}

/** Close out tracking at run end: CPU-seconds is the before/after diff on the main process (exact, no
 *  sampling error); peak RSS is the high-water mark from every `sampleRunResource` call this run made
 *  (0 if the run never sampled — e.g. it failed before its first step). */
export function finishRunResourceTracking(state: RunResourceTrackerState): RunResourceUsage {
  const cpu = process.resourceUsage();
  return {
    peakRssBytes: state.acc.peakRssBytes,
    cpuSeconds: cpuSecondsDelta(state.cpuBaselineMicros, {
      userCPUTime: cpu.userCPUTime,
      systemCPUTime: cpu.systemCPUTime,
    }),
  };
}
