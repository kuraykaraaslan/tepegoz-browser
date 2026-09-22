import { z } from 'zod';
import { EventJournal } from '@tepegoz/persistence';
import { registrableDomain, registrableDomainOfHost } from '@tepegoz/security-policy';
import type { PermissionDecisionQuery, PermissionDecisionRecord } from '@tepegoz/desktop-ipc';
import { getDb } from '../db/database.electron';

/**
 * Permission Debug (S8 PR7): a READ-ONLY history of past Policy Kernel decisions, for a chosen site
 * and/or tool. Reads what `ipc-agent-run.ts`'s `onAudit` hook already journals per call — this file
 * adds no decision logic and touches nothing the kernel enforces; it only reconstructs a view over
 * already-recorded facts.
 *
 * See `contract-app.ts`'s {@link PermissionDecisionRecord} for why `reason`/`riskTier` are kept as
 * bare strings rather than importing the narrower `@tepegoz/security-policy` unions into the
 * preload-safe contract package.
 */

/** The two journal types `onAudit` writes: a call that ran (`allow`, or `ask` → approved) and a call
 *  that was blocked (`deny`, or `ask` → refused). Both share the same payload shape. */
const DECISION_JOURNAL_TYPES = ['ToolInvoked', 'PolicyBlocked'] as const;

const DecisionPayloadSchema = z.object({
  toolName: z.string().min(1),
  targetUrl: z.string().optional(),
  reason: z.string().min(1),
  riskTier: z.string().optional(),
  decision: z.enum(['allow', 'ask', 'deny']),
  outcome: z.enum(['approved', 'refused']).optional(),
  rememberedBy: z.enum(['plan_grant', 'remembered_grant', 'autonomy']).optional(),
});

/**
 * How many journal rows to read (by TYPE) before filtering by site/tool in memory. The journal has no
 * payload-shaped SQL column to filter on directly — this is a debug view, not a hot path, so reading a
 * generous batch and filtering here is the honest trade rather than adding a column for one screen.
 */
const READ_BATCH = 2000;
const DEFAULT_LIMIT = 100;

export function permissionDecisionHistory(
  query: PermissionDecisionQuery,
): PermissionDecisionRecord[] {
  const db = getDb();
  if (db === null) return [];

  const siteFilter =
    query.site !== undefined && query.site.trim().length > 0
      ? registrableDomainOfHost(query.site.trim())
      : null;
  const toolFilter =
    query.tool !== undefined && query.tool.trim().length > 0
      ? query.tool.trim().toLowerCase()
      : null;
  const limit = query.limit ?? DEFAULT_LIMIT;

  const rows = EventJournal.readByTypes(db, DECISION_JOURNAL_TYPES, READ_BATCH);
  const out: PermissionDecisionRecord[] = [];
  for (const row of rows) {
    const parsed = DecisionPayloadSchema.safeParse(row.payload);
    if (!parsed.success) continue; // an older/foreign journal shape — skip rather than guess
    const p = parsed.data;

    if (siteFilter !== null) {
      const rowSite = p.targetUrl !== undefined ? registrableDomain(p.targetUrl) : null;
      if (rowSite === null || rowSite !== siteFilter) continue;
    }
    if (toolFilter !== null && !p.toolName.toLowerCase().includes(toolFilter)) continue;

    out.push({
      ts: row.ts,
      runId: row.correlationId,
      toolName: p.toolName,
      ...(p.targetUrl !== undefined ? { targetUrl: p.targetUrl } : {}),
      reason: p.reason,
      ...(p.riskTier !== undefined ? { riskTier: p.riskTier } : {}),
      decision: p.decision,
      ...(p.outcome !== undefined ? { outcome: p.outcome } : {}),
      ...(p.rememberedBy !== undefined ? { rememberedBy: p.rememberedBy } : {}),
    });
    if (out.length >= limit) break;
  }
  return out;
}
