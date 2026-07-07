import { randomUUID } from 'node:crypto';
import type { Db } from './db';
import { MetaStore } from './meta';

/**
 * One unit of persisted model usage — the shape the host derives from the in-memory TokenLedger's
 * per-(provider,model,capability) snapshot. Deliberately structural (plain strings) so persistence (L1)
 * stays decoupled from the model gateway (L7); the caller passes the ledger's rows straight through.
 */
export interface TokenUsageEntry {
  provider: string;
  model: string;
  capability: string;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  calls: number;
}

/** Aggregated usage for one provider/model/capability (Settings insight + quota breakdown). */
export interface TokenUsageByModel extends TokenTotals {
  provider: string;
  model: string;
  capability: string;
}

interface TotalsRow {
  input_tokens: number | null;
  output_tokens: number | null;
  calls: number | null;
}

/**
 * SQLite Token Ledger (L7 persistence). Cross-restart, sync-ready usage accounting at
 * provider+model+capability granularity. The live in-memory `TokenLedger` counts the current run; at
 * run end the host persists that run's rows here, so the quota indicator + 80% warning reflect
 * cumulative (lifetime) spend rather than one task.
 *
 * Refunded rows (auto-refund on system-error/CAPTCHA/loop) and tombstoned rows are excluded from the
 * quota total — the user's budget is not spent when a run fails for reasons outside their control.
 */
export class TokenStore {
  /** Persist a completed run's usage rows. No-op for empty/zero input. Written in one transaction. */
  static recordRun(
    db: Db,
    params: { correlationId?: string | undefined; ts: number; entries: readonly TokenUsageEntry[] },
  ): void {
    const rows = params.entries.filter(
      (e) => e.calls > 0 || e.inputTokens > 0 || e.outputTokens > 0,
    );
    if (rows.length === 0) return;
    const deviceId = MetaStore.deviceId(db);
    const insert = db.prepare(
      `INSERT INTO token_usage (
        id, ts, device_id, correlation_id, provider, model, capability,
        input_tokens, output_tokens, calls, refunded, updated_at, version, tombstone
      ) VALUES (
        @id, @ts, @deviceId, @correlationId, @provider, @model, @capability,
        @inputTokens, @outputTokens, @calls, 0, @ts, 1, 0
      )`,
    );
    const tx = db.transaction(() => {
      for (const e of rows) {
        insert.run({
          id: randomUUID(),
          ts: params.ts,
          deviceId,
          correlationId: params.correlationId ?? null,
          provider: e.provider,
          model: e.model,
          capability: e.capability,
          inputTokens: e.inputTokens,
          outputTokens: e.outputTokens,
          calls: e.calls,
        });
      }
    });
    tx();
  }

  /**
   * Mark a run's rows refunded so they no longer count toward the quota (auto-refund). Bumps the sync
   * `version` + `updated_at` so a later account sync propagates the refund. Returns rows affected.
   */
  static refundRun(db: Db, correlationId: string, at: number): number {
    const info = db
      .prepare(
        `UPDATE token_usage
         SET refunded = 1, version = version + 1, updated_at = @at
         WHERE correlation_id = @correlationId AND refunded = 0 AND tombstone = 0`,
      )
      .run({ correlationId, at });
    return Number(info.changes);
  }

  /** Lifetime totals across every non-refunded, non-tombstoned row (feeds the quota indicator baseline). */
  static lifetimeTotals(db: Db): TokenTotals {
    const row = db
      .prepare(
        `SELECT SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, SUM(calls) AS calls
         FROM token_usage WHERE refunded = 0 AND tombstone = 0`,
      )
      .get() as TotalsRow;
    const inputTokens = row.input_tokens ?? 0;
    const outputTokens = row.output_tokens ?? 0;
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      calls: row.calls ?? 0,
    };
  }

  /** Per-(provider,model,capability) aggregation of non-refunded usage, highest total first. */
  static usageByModel(db: Db): TokenUsageByModel[] {
    const rows = db
      .prepare(
        `SELECT provider, model, capability,
                SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, SUM(calls) AS calls
         FROM token_usage
         WHERE refunded = 0 AND tombstone = 0
         GROUP BY provider, model, capability
         ORDER BY SUM(input_tokens) + SUM(output_tokens) DESC`,
      )
      .all() as Array<TotalsRow & { provider: string; model: string; capability: string }>;
    return rows.map((r) => {
      const inputTokens = r.input_tokens ?? 0;
      const outputTokens = r.output_tokens ?? 0;
      return {
        provider: r.provider,
        model: r.model,
        capability: r.capability,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        calls: r.calls ?? 0,
      };
    });
  }

  /** Erase all usage history (Settings → clear usage). Soft-deletes via tombstone for sync propagation. */
  static clear(db: Db, at: number): void {
    db.prepare(
      'UPDATE token_usage SET tombstone = 1, version = version + 1, updated_at = @at WHERE tombstone = 0',
    ).run({ at });
  }
}
