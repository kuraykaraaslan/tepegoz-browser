import { useEffect, useState } from 'react';
import type { AgentConversationDetail, AgentConversationSummary, AgentHostApi } from './types';
import { Dropdown } from './panel-dropdown';
import { HistoryIcon } from './panel-icons';

const FULL_HISTORY_URL = 'tepegoz://agent-history';

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
  };
  iconButtonClassName: string;
  onOpenConversation: (detail: AgentConversationDetail) => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AgentConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api.listAgentConversations({ query, limit: 10 }).then((next) => {
      if (cancelled) return;
      setItems(next);
      setLoading(false);
    }, () => {
      if (cancelled) return;
      setItems([]);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [api, query]);

  useEffect(() => {
    return api.onAgentConversationsState((state) => {
      if (query.trim().length === 0) setItems(state.items.slice(0, 10));
    });
  }, [api, query]);

  return (
    <Dropdown
      align="right"
      showChevron={false}
      ariaLabel={labels.label}
      title={labels.label}
      triggerClassName={iconButtonClassName}
      trigger={<HistoryIcon className="h-4 w-4" />}
    >
      {(close) => (
        <div className="w-80">
          <label className="sr-only" htmlFor="agent-conversation-history-search">{labels.search}</label>
          <input
            id="agent-conversation-history-search"
            value={query}
            type="text"
            spellCheck={false}
            placeholder={labels.search}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="mb-2 h-9 w-full rounded-md border border-border bg-surface-base px-3 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          />
          <div className="max-h-72 overflow-auto">
            {loading ? (
              <p className="px-2 py-8 text-center text-sm text-text-secondary">{labels.loading}</p>
            ) : items.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-text-secondary">{labels.empty}</p>
            ) : (
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (groupId === null) return;
                        void api.openAgentConversation({ id: item.id, groupId }).then((detail) => {
                          if (detail !== null) onOpenConversation(detail);
                          close();
                        });
                      }}
                      className="w-full rounded-md px-2 py-2 text-left hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      <p className="truncate text-sm font-medium text-text-primary">{item.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{item.preview}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => { api.createTab(FULL_HISTORY_URL); close(); }}
            className="mt-2 w-full border-t border-border px-2 pt-2 text-left text-sm font-medium text-text-primary hover:text-amber-500 focus-visible:outline-none"
          >
            {labels.full}
          </button>
        </div>
      )}
    </Dropdown>
  );
}
