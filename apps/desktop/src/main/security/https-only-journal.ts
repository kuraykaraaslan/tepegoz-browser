import { randomUUID } from 'node:crypto';
import { Logger } from '@tepegoz/libs';
import { EventJournal } from '@tepegoz/persistence';
import { getDb } from '../db/database.electron';
import type { TunnelKind } from '../network/https-only';

/**
 * Event Journal record for the one HTTPS-only decision that weakens the default: the user chose to
 * load a plain-http host on a tunnel-bound tab after the upgrade was refused.
 *
 * Only that weakening choice is recorded. Going back restores the default and leaves nothing to audit.
 * The bypass itself is session-only and in-memory, so without this row it would leave no trace at all.
 *
 * The payload is the hostname and the tunnel kind. Never the path or query: those can carry tokens
 * and search terms, and the journal is permanent.
 *
 * Never throws. An audit write must not take down the navigation it was auditing.
 */
export function journalHttpsOnlyBypass(host: string, tunnelKind: TunnelKind): void {
  const db = getDb();
  if (db === null) return;
  const ts = Date.now();
  try {
    EventJournal.append(db, {
      id: randomUUID(),
      type: 'HttpsOnlyBypassed',
      ts,
      actor: 'user',
      correlationId: `https-only-${String(ts)}`,
      redacted: true,
      payload: { host, tunnelKind, ts },
    });
  } catch (err: unknown) {
    Logger.warn('HTTPS-only audit append failed', { err: String(err) });
  }
}
