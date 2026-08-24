import { randomUUID } from 'node:crypto';
import { Logger } from '@tepegoz/libs';
import { EventJournal } from '@tepegoz/persistence';
import { getDb } from '../db/database.electron';

/**
 * Event Journal records for the two certificate decisions a user can make against the browser's own
 * safe default.
 *
 * Both brokers already refused, prompted and logged correctly; what neither did was leave a record the
 * user can go back and read. `Logger` is a process log — it rotates, it is not queryable, and it is not
 * where this product says its auditable facts live (ADR-0004). These are exactly the kind of fact that
 * belongs in an append-only journal: a decision, made once, whose consequences outlive the moment.
 *
 * **Only the weakening choice is recorded.** Proceeding past a bad server certificate is a
 * transport-security downgrade; sending a client certificate is an identity disclosure. A refusal
 * restores the default and leaves nothing to audit — and in the certificate-error case refusals are
 * deliberately not remembered, so recording them would let one broken site write unbounded rows.
 *
 * **The user's identity never enters the journal.** A client certificate's `subjectName` is the user's
 * own name — in this product's primary market, an e-Devlet certificate carries their national ID. So
 * the record carries the ORIGIN and the certificate's `fingerprint`, which says *which* certificate was
 * used without writing down who they are. This continues the rule the broker already follows for its
 * log lines, into the store that keeps things permanently.
 *
 * Never throws. An audit write that takes down the decision it was auditing would turn a working
 * refusal into a hung connection.
 */

function append(
  type: 'CertificateErrorProceeded' | 'ClientCertificateSent',
  correlationPrefix: string,
  payload: Record<string, unknown>,
): void {
  const db = getDb();
  if (db === null) return;
  const ts = Date.now();
  try {
    EventJournal.append(db, {
      id: randomUUID(),
      type,
      ts,
      // 'user', not 'system': both of these exist only because a human answered a prompt. An agent
      // cannot reach either decision — the sensitive-site lockout hard-blocks the certificate-error
      // path outright, and no capability sends a client certificate.
      actor: 'user',
      correlationId: `${correlationPrefix}-${String(ts)}`,
      redacted: true,
      payload: { ...payload, ts },
    });
  } catch (err: unknown) {
    Logger.warn('Certificate audit append failed', { type, err: String(err) });
  }
}

/**
 * The user chose to proceed past an invalid server certificate for `origin`.
 *
 * Worth a permanent row because the exception itself is not permanent: it lives in memory and dies with
 * the process, deliberately, since a persisted exception is a standing transport-security downgrade. So
 * without this the fact that it ever happened leaves no trace at all.
 */
export function journalCertificateProceed(origin: string, errorCode: string): void {
  append('CertificateErrorProceeded', 'cert-error', { origin, errorCode });
}

/**
 * A client certificate was sent to `origin`, identified by `fingerprint` — never by subject.
 *
 * The remembered choice is per-origin and per-run, so this writes once per origin per run rather than
 * once per TLS handshake; client auth renegotiates per connection and a row for each would be noise
 * that buries the signal.
 */
export function journalClientCertificateSent(origin: string, fingerprint: string): void {
  append('ClientCertificateSent', 'client-cert', { origin, fingerprint });
}
