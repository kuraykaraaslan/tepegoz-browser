import type { AgentStrings } from './i18n';

/**
 * The resource chip (S7 PR6 "Resource accounting per run") — peak memory + CPU time the run ITSELF
 * cost, shown next to the token chip (which measures $ cost, a different question) so "the agent made
 * my browser slow" becomes a number instead of an argument.
 *
 * `formatMemory` below is deliberately the SAME algorithm as the Task Manager's own byte formatter
 * (`@tepegoz/process-ui`'s `formatBytes`: binary-prefix KB/MB/GB, one decimal past KB) — not imported
 * from it, because `@tepegoz/process-ui` already depends on `@tepegoz/desktop-ipc`, which depends back
 * on `@tepegoz/ext-agent` for its wire types; adding the reverse edge here would close a workspace
 * dependency cycle across four packages. A ~6-line pure function kept in lockstep is the smaller cost.
 */

/** Binary-prefix byte formatter, matching `@tepegoz/process-ui`'s `formatBytes` exactly (KiB/MiB/GiB,
 *  one decimal past KB) so the same byte count reads identically here and in the Task Manager. */
function formatMemory(bytes: number): string {
  if (bytes < 1024) return `${String(Math.round(bytes))} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/** `0.3s` under ten seconds (most runs finish in a handful of CPU-seconds, where a whole second is too
 *  coarse), `12s` at/after — this is a cost signal, not a stopwatch, so it never needs millisecond
 *  precision the way the per-step duration chip does. */
function formatCpuSeconds(seconds: number): string {
  const s = Math.max(0, seconds);
  return s < 10 ? `${s.toFixed(1)}s` : `${String(Math.round(s))}s`;
}

interface ResourceChipProps {
  /** {@link TokenUsageSnapshot.peakRssBytes} — undefined before any run has completed, or on a build
   *  that does not report it. */
  peakRssBytes: number | undefined;
  /** {@link TokenUsageSnapshot.cpuSeconds} — same availability as {@link peakRssBytes}. */
  cpuSeconds: number | undefined;
  a: AgentStrings;
}

export function ResourceChip({ peakRssBytes, cpuSeconds, a }: ResourceChipProps) {
  // No data yet → render nothing, the same rule the context gauge uses for "unknown" vs "zero": a real
  // process never actually reports 0 resident bytes, so 0/undefined/non-finite means "unmeasured",
  // never "measured and free".
  if (
    peakRssBytes === undefined ||
    !Number.isFinite(peakRssBytes) ||
    peakRssBytes <= 0 ||
    cpuSeconds === undefined ||
    !Number.isFinite(cpuSeconds)
  ) {
    return null;
  }

  const mem = formatMemory(peakRssBytes);
  const cpu = formatCpuSeconds(cpuSeconds);
  const fill = (s: string): string => s.replace('{mem}', mem).replace('{cpu}', cpu);

  return (
    <span
      className="rounded-full bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary"
      aria-label={fill(a.resourceUsage.aria)}
      title={fill(a.resourceUsage.tooltip)}
    >
      {fill(a.resourceUsage.label)}
    </span>
  );
}
