import { useEffect, useState } from 'react';
import { cn } from '@tepegoz/ui';
import type { AgentConversationDetail, AgentConversationSummary, AgentHostApi } from './types';
import { Dropdown } from './panel-dropdown';
import { HistoryIcon, TrashIcon } from './panel-icons';

const FULL_HISTORY_URL = 'tepegoz://com.tepegoz.agent';

/** How many recent conversations the dropdown shows (and the query limit). */
const RECENT_LIMIT = 5;

/**
 * Read-state is DEVICE-LOCAL (you read a conversation on this machine, not across synced devices), so it
 * lives in localStorage — a map of conversationId → the `updatedAt` last seen. A conversation is "unread"
 * when it has newer activity than what we last saw; opening it marks it read.
 */
const READ_KEY = 'tepegoz.agent.conversationReadAt';

function loadReadMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [id, ts] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof ts === 'number' && Number.isFinite(ts)) out[id] = ts;
    }
    return out;
  } catch {
    return {};
  }
}

function saveReadMap(map: Record<string, number>): void {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable/full — read-state is best-effort, never fatal */
  }
}

export function ConversationHistoryDropdown({
  api,
  groupId,
  labels,
  iconButtonClassName,
  onOpenConversation,
}: {
  api: AgentHostApi;
  groupId: string | null;
  labels: {
    label: string;
    search: string;
    empty: string;
    loading: string;
    full: string;
    delete: string;
  };
  iconButtonClassName: string;
  onOpenConversation: (detail: AgentConversationDetail) => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AgentConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [readAt, setReadAt] = useState<Record<string, number>>(loadReadMap);

  const markRead = (id: string, updatedAt: number): void => {
    setReadAt((prev) => {
      if ((prev[id] ?? 0) >= updatedAt) return prev;
      const next = { ...prev, [id]: updatedAt };
      saveReadMap(next);
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api.listAgentConversations({ query, limit: RECENT_LIMIT }).then(
      (next) => {
        if (cancelled) return;
        setItems(next);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setItems([]);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, query]);

  useEffect(() => {
    return api.onAgentConversationsState((state) => {
      if (query.trim().length === 0) setItems(state.items.slice(0, RECENT_LIMIT));
    });
  }, [api, query]);

  const deleteConversation = (id: string) => {
    setItems((prev) => prev.filter((c) => c.id !== id));
    void api.deleteAgentConversation(id);
  };

  return (
    <Dropdown
      align="right"
      showChevron={false}
      menuClassName="w-80"
      testId="agent-history-menu"
      ariaLabel={labels.label}
      title={labels.label}
      triggerClassName={iconButtonClassName}
      trigger={<HistoryIcon className="h-4 w-4" />}
    >
      {(close) => (
        <div className="w-full">
          <label className="sr-only" htmlFor="agent-conversation-history-search">
            {labels.search}
          </label>
          <input
            id="agent-conversation-history-search"
            value={query}
            type="text"
            spellCheck={false}
            placeholder={labels.search}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="mb-2 h-9 w-full rounded-md border border-border bg-surface-base px-3 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          />
          <div className="max-h-72 overflow-y-auto overflow-x-hidden">
            {loading ? (
              <p className="px-2 py-8 text-center text-sm text-text-secondary">{labels.loading}</p>
            ) : items.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-text-secondary">{labels.empty}</p>
            ) : (
              <ul className="space-y-1">
                {items.map((item) => {
                  const unread = item.updatedAt > (readAt[item.id] ?? 0);
                  return (
                    <li key={item.id} className="group/item relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (groupId === null) return;
                          markRead(item.id, item.updatedAt);
                          void api
                            .openAgentConversation({ id: item.id, groupId })
                            .then((detail) => {
                              if (detail !== null) onOpenConversation(detail);
                              close();
                            });
                        }}
                        className="flex w-full items-start gap-2 rounded-md py-2 pl-2 pr-9 text-left hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      >
                        {/* Unread indicator: blue when there's activity newer than last opened, else muted gray. */}
                        <span
                          aria-hidden
                          className={cn(
                            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                            unread ? 'bg-sky-500' : 'bg-text-disabled',
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-text-primary">
                            {item.title}
                          </span>
                          <span className="mt-0.5 block line-clamp-2 text-xs text-text-secondary [overflow-wrap:anywhere]">
                            {item.preview}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={labels.delete}
                        title={labels.delete}
                        onClick={() => deleteConversation(item.id)}
                        className="absolute right-1 top-1 rounded-md p-1.5 text-text-secondary opacity-70 hover:bg-surface-base hover:text-red-500 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              api.createTab(FULL_HISTORY_URL);
              close();
            }}
            className="mt-2 w-full border-t border-border px-2 pt-2 text-left text-sm font-medium text-text-primary hover:text-amber-500 focus-visible:outline-none"
          >
            {labels.full}
          </button>
        </div>
      )}
    </Dropdown>
  );
}
