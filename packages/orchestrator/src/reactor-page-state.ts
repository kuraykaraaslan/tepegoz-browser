/**
 * Transient page-state (AI-3): a long run must not accumulate DOM dumps. The reactor keeps only the
 * LATEST large observation live; when a new page-state blob is fed back, the previous one is collapsed
 * to {@link COLLAPSED_STATE_PLACEHOLDER}, so the compact decisions (with their `memory`) stay the
 * persistent history while raw snapshots do not pile up. These thresholds parameterise that collapse.
 */

/** Observations longer than this are treated as page-state blobs subject to transient collapse (AI-3). */
export const STATE_COLLAPSE_THRESHOLD = 800;

/** Replaces a superseded page-state observation so only the LATEST one stays live (bounds context). */
export const COLLAPSED_STATE_PLACEHOLDER =
  'Observation: [an earlier page snapshot was omitted here to save context — re-read ' +
  'browser_get_elements / browser_get_page if you need that page state again].';
