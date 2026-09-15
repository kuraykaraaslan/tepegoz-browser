import { shell } from 'electron';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { AgentExportRunReportSchema } from '@tepegoz/desktop-ipc/schemas';
import { EventJournal, TokenStore } from '@tepegoz/persistence';
import { buildRunReport, renderRunReportMarkdown } from '@tepegoz/notary';
import { getDb } from '../db/database.electron';
import FileOperationsHost from '../file-operations/file-operations-host';
import { handleAsync } from './ipc-helpers';
import { requireAgentEnabled } from './ipc-agent-shared';

// The journal caps a scoped read at 1000 (`EventJournal.readRecent`); a single agentic run does not
// approach that in practice, so one read is enough — no pagination needed for a per-run report.
const MAX_RUN_REPORT_EVENTS = 1000;

/**
 * Register `agent:export-run-report` (Phase 7 NotaryService — the unsigned, human-readable Run Report,
 * "shippable before the wiring"). Reads ONE run's Journal events + non-refunded token totals, renders
 * the Markdown via `@tepegoz/notary`, and writes it to `~/tepegoz/` the same way the plain chat-log
 * export does — no database handle crosses the boundary, only the finished document.
 */
export function registerAgentRunReportIpc(): void {
  handleAsync(IpcChannels.agentExportRunReport, async (_event, payload): Promise<string> => {
    requireAgentEnabled();
    const { runId, goal } = AgentExportRunReportSchema.parse(payload);
    const db = getDb();
    const events = db === null ? [] : EventJournal.readRecent(db, MAX_RUN_REPORT_EVENTS, runId);
    const tokenTotals = db === null ? null : TokenStore.totalsForRun(db, runId);
    const report = buildRunReport({
      runId,
      goal,
      generatedAt: Date.now(),
      events,
      // Omitted rather than a zeroed block when there is nothing to show — the report already says
      // "unknown" for an absent terminal event rather than inventing one, same honesty here.
      ...(tokenTotals !== null && tokenTotals.totalTokens > 0
        ? {
            tokenUsage: {
              inputTokens: tokenTotals.inputTokens,
              outputTokens: tokenTotals.outputTokens,
              totalTokens: tokenTotals.totalTokens,
            },
          }
        : {}),
    });
    const markdown = renderRunReportMarkdown(report);
    const now = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    const stamp =
      `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
      `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `ai_agent_run_report_${stamp}.md`;
    const full = await FileOperationsHost.writeExport(filename, markdown);
    shell.showItemInFolder(full);
    return full;
  });
}
