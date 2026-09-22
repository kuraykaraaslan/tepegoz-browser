import { ConnectionTestResultSchema, type ConnectionTestResult } from '@tepegoz/shared-types';

/**
 * The renderer's read of a `network:test-connection` response (Phase 5: the manual "test this
 * connection" flow).
 *
 * `safeParse`d at the boundary like every other main→renderer payload this phase pushes
 * (`parseConnectionHealth` is the sibling of this) — a response that does not validate degrades to
 * `null` and the panel says the test could not be read, rather than throwing or rendering a wrong stage.
 */
export function parseConnectionTestResult(raw: unknown): ConnectionTestResult | null {
  const parsed = ConnectionTestResultSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
