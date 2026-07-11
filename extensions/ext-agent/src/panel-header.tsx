import { cn } from '@tepegoz/ui';
import type { Resources } from '@tepegoz/i18n';
import type { AgentStrings } from './i18n';
import type { AgentConversationDetail, AgentHostApi, TokenUsageSnapshot } from './types';
import { ConversationHistoryDropdown } from './conversation-history-dropdown';
import { CheckIcon, CloseIcon, NewTaskIcon, ScheduleIcon, SparkIcon } from './panel-icons';
import { ICON_BTN } from './panel-styles';

/**
 * The Agent panel header (title + export star + token quota + history/schedule/new-task/close), plus the
 * export-failure banner that renders directly beneath it. Extracted from `panel.tsx` (ADR-0010 split).
 */
interface PanelHeaderProps {
  a: AgentStrings;
  c: Resources;
  api: AgentHostApi;
  activeGroupId: string | null;
  tokens: TokenUsageSnapshot | null;
  turnCount: number;
  logExported: boolean;
  exportError: string | null;
  onExportLog: () => void;
  onNewTask: () => void;
  onClose: () => void;
  onSchedule: () => void;
  onOpenConversation: (detail: AgentConversationDetail) => void;
  onDismissExportError: () => void;
}

export function PanelHeader({
  a,
  c,
  api,
  activeGroupId,
  tokens,
  turnCount,
  logExported,
  exportError,
  onExportLog,
  onNewTask,
  onClose,
  onSchedule,
  onOpenConversation,
  onDismissExportError,
}: PanelHeaderProps) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExportLog}
            disabled={turnCount === 0}
            aria-label={logExported ? a.exportLog.saved : a.exportLog.action}
            title={logExported ? a.exportLog.saved : a.exportLog.action}
            className="-m-0.5 rounded-md p-0.5 hover:bg-surface-overlay disabled:cursor-default disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            {logExported ? (
              <CheckIcon className="h-4 w-4 text-emerald-500" />
            ) : (
              <SparkIcon className="h-4 w-4 text-amber-500" />
            )}
          </button>
          <h2 className="text-sm font-semibold text-text-primary">{a.title}</h2>
        </div>
        <div className="flex items-center gap-1.5">
          {tokens !== null && tokens.quota > 0 ? (
            // Quota indicator: cumulative lifetime usage against the account quota; amber at ≥80%.
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs',
                tokens.lifetimeTokens / tokens.quota >= 0.8
                  ? 'bg-amber-500/15 text-amber-500'
                  : 'bg-surface-overlay text-text-secondary',
              )}
              title={`${a.tokens}: ${String(tokens.inputTokens)} in / ${String(tokens.outputTokens)} out (this run)`}
            >
              {a.tokens}: {tokens.lifetimeTokens.toLocaleString()} / {tokens.quota.toLocaleString()}
            </span>
          ) : (
            tokens !== null &&
            tokens.totalTokens > 0 && (
              <span
                className="rounded-full bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary"
                title={`${a.tokens}: ${String(tokens.inputTokens)} in / ${String(tokens.outputTokens)} out`}
              >
                {a.tokens}: {tokens.totalTokens.toLocaleString()}
              </span>
            )
          )}
          <ConversationHistoryDropdown
            api={api}
            groupId={activeGroupId}
            labels={a.history}
            iconButtonClassName={ICON_BTN}
            onOpenConversation={onOpenConversation}
          />
          {turnCount > 0 && (
            <button
              type="button"
              onClick={onSchedule}
              aria-label={a.scheduleTask.action}
              title={a.scheduleTask.action}
              className={ICON_BTN}
            >
              <ScheduleIcon className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={onNewTask} aria-label={a.newTask} title={a.newTask} className={ICON_BTN}>
            <NewTaskIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={onClose} aria-label={c.window.close} title={c.window.close} className={ICON_BTN}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Export failure banner (a blocked/failed chat-log export is never silent). */}
      {exportError !== null && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
        >
          <span className="flex-1"><span className="font-semibold">{a.exportLog.failed}</span> {exportError}</span>
          <button
            type="button"
            aria-label={c.window.close}
            onClick={onDismissExportError}
            className="shrink-0 opacity-60 hover:opacity-100 focus-visible:outline-none"
          >
            <CloseIcon className="h-3 w-3" />
          </button>
        </div>
      )}
    </>
  );
}
