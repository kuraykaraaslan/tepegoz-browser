import type { AgentWorkingState } from '@tepegoz/shared-types';

/**
 * Runtime side of the typed working state (Phase C1 / `s15`). The SCHEMA is the single source in
 * `@tepegoz/shared-types` ({@link AgentWorkingState}); this module holds the reactor-local logic that
 * keeps an authoritative snapshot current and renders it into the compact persistent block re-injected
 * each step (see `reactor.ts`). Pure + deterministic so it is unit-testable without a model.
 */

/** True when the ledger carries no content — the reactor then injects nothing (byte-identical legacy). */
export function isWorkingStateEmpty(s: AgentWorkingState): boolean {
  return (
    (s.openTabs?.length ?? 0) === 0 &&
    (s.selectedRecords?.length ?? 0) === 0 &&
    (s.filledFields?.length ?? 0) === 0 &&
    (s.completedSubtasks?.length ?? 0) === 0 &&
    (s.pendingVerifications?.length ?? 0) === 0
  );
}

/**
 * Field-level merge of the model's proposed patch onto the authoritative snapshot. A field the patch
 * OMITS (`undefined`) is carried forward; a field it PROVIDES replaces the prior value — including an
 * explicit empty array, which lets the model deliberately clear one (e.g. a pending verification once it
 * confirms). So the model can update the ledger incrementally OR re-emit a full snapshot; both work.
 */
export function mergeWorkingState(prev: AgentWorkingState, patch: AgentWorkingState): AgentWorkingState {
  return {
    openTabs: patch.openTabs ?? prev.openTabs,
    selectedRecords: patch.selectedRecords ?? prev.selectedRecords,
    filledFields: patch.filledFields ?? prev.filledFields,
    completedSubtasks: patch.completedSubtasks ?? prev.completedSubtasks,
    pendingVerifications: patch.pendingVerifications ?? prev.pendingVerifications,
  };
}

function renderTab(t: NonNullable<AgentWorkingState['openTabs']>[number]): string {
  const label = t.title ?? t.note ?? 'tab';
  const id = t.id !== undefined ? `[${t.id}] ` : '';
  const note = t.note !== undefined && t.note !== t.title ? ` — ${t.note}` : '';
  return `${id}${label}${note}`;
}

/** Compact, deterministic rendering of the ledger — one line per non-empty section. */
export function renderWorkingState(s: AgentWorkingState): string {
  const lines: string[] = [];
  if (s.openTabs && s.openTabs.length > 0) {
    lines.push(`- Open tabs: ${s.openTabs.map(renderTab).join(' ; ')}`);
  }
  if (s.selectedRecords && s.selectedRecords.length > 0) {
    lines.push(`- Selected: ${s.selectedRecords.join(' ; ')}`);
  }
  if (s.filledFields && s.filledFields.length > 0) {
    lines.push(
      `- Filled: ${s.filledFields
        .map((f) => (f.value !== undefined ? `${f.field} = ${f.value}` : f.field))
        .join(' ; ')}`,
    );
  }
  if (s.completedSubtasks && s.completedSubtasks.length > 0) {
    lines.push(`- Completed: ${s.completedSubtasks.join(' ; ')}`);
  }
  if (s.pendingVerifications && s.pendingVerifications.length > 0) {
    lines.push(`- Pending verification: ${s.pendingVerifications.join(' ; ')}`);
  }
  return lines.join('\n');
}

/** Preamble on the injected block — names the ledger as authoritative and ties finishing to it. */
export const WORKING_STATE_HEADER =
  'Working state (your progress ledger — the authoritative record of what you have done). Update it by ' +
  'emitting `state` on every decision, and do NOT finish while anything is still pending verification:';

/** Replaces a superseded working-state block so only the LATEST one stays live (bounds context, mirrors
 *  the transient page-state collapse). */
export const COLLAPSED_WORKING_STATE_PLACEHOLDER =
  '[an earlier working-state snapshot was superseded — the current ledger is below].';
