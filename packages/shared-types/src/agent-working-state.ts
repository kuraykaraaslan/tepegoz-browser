import { z } from 'zod';

/**
 * The agent's TYPED working memory (Phase C1 / v1's `s15`). Today the actor's only cross-step memory is a
 * free-text `memory` string riding the chat history — it gets buried under observations and lost when the
 * transient page-state collapse trims context, which is a measured cause of the model losing the thread
 * and *escaping* off-task (web-searching "how do I confirm this saved?" instead of finishing on-page).
 *
 * This is a structured, always-current ledger the reactor maintains and re-injects each step in place of
 * relying on that prose. The model PROPOSES an update on its decision; the runtime MERGES it into an
 * authoritative snapshot and feeds the merged snapshot back — so progress survives context bounding.
 *
 * The model's proposal is UNTRUSTED (json_object mode guarantees valid JSON, not shape), so every field is
 * a tolerant optional exactly like {@link ../orchestrator reactor-decision}'s brain fields, and the whole
 * object is dropped (never fatal) when it fails to parse. Strings/arrays are bounded to keep the injected
 * block small — the ledger is a summary, not a transcript.
 */

/** One tab the agent has opened, and what it is for. `id` is the tab id to pass back to `browser_*` tools. */
export const WorkingStateTabSchema = z.object({
  id: z.string().max(100).optional(),
  title: z.string().max(200).optional(),
  note: z.string().max(200).optional(),
});
export type WorkingStateTab = z.infer<typeof WorkingStateTabSchema>;

/** One form field the agent has filled, and (optionally) with what value. */
export const WorkingStateFieldSchema = z.object({
  field: z.string().min(1).max(120),
  value: z.string().max(200).optional(),
});
export type WorkingStateField = z.infer<typeof WorkingStateFieldSchema>;

const LedgerNote = z.string().min(1).max(200);

export const AgentWorkingStateSchema = z.object({
  /** Tabs the agent opened and their purpose (so a multi-tab task keeps its world model). */
  openTabs: z.array(WorkingStateTabSchema).max(20).optional(),
  /** Records/items the agent has picked out on the way to the goal (e.g. "Blue Widget ($5)"). */
  selectedRecords: z.array(LedgerNote).max(40).optional(),
  /** Fields already filled — so the agent never re-fills or forgets a completed field. */
  filledFields: z.array(WorkingStateFieldSchema).max(40).optional(),
  /** Sub-tasks the agent counts as done — its explicit progress against the goal. */
  completedSubtasks: z.array(LedgerNote).max(40).optional(),
  /** Claims made but NOT yet confirmed against page/network evidence — the honesty hook C6 builds on:
   *  the agent must not finish while a verification is still pending. */
  pendingVerifications: z.array(LedgerNote).max(20).optional(),
});
export type AgentWorkingState = z.infer<typeof AgentWorkingStateSchema>;
