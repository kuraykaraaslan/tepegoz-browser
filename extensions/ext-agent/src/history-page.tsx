import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import type {
  AgentConversationDetail,
  AgentConversationSummary,
  AgentConversationsState,
  AgentHostApi,
} from './types';
import { agentDict } from './i18n';

const PAGE_SIZE = 50;

export function AgentHistoryPage({ api }: Readonly<{ api: AgentHostApi; onClose: () => void }>) {
  const t = useT(agentDict).historyPage;
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AgentConversationSummary[]>([]);
  const [selected, setSelected] = useState<AgentConversationDetail | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useEffect(
    () =>
      api.onAgentConversationsState((state: AgentConversationsState) => {
        if (query.trim().length === 0) setItems(state.items);
      }),
    [api, query],
  );

  useEffect(() => {
    let cancelled = false;
    loadingRef.current = true;
    setLoading(true);
    void api.listAgentConversations({ query: query.trim(), offset: 0, limit: PAGE_SIZE }).then(
      (page) => {
        if (cancelled) return;
        loadingRef.current = false;
        setItems(page);
        setOffset(page.length);
        setHasMore(page.length === PAGE_SIZE);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        loadingRef.current = false;
        setItems([]);
        setOffset(0);
        setHasMore(false);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, query]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    void api.listAgentConversations({ query: query.trim(), offset, limit: PAGE_SIZE }).then(
      (page) => {
        loadingRef.current = false;
        setItems((prev) => [...prev, ...page]);
        setOffset((prev) => prev + page.length);
        setHasMore(page.length === PAGE_SIZE);
        setLoading(false);
      },
      () => {
        loadingRef.current = false;
        setLoading(false);
      },
    );
  }, [api, hasMore, offset, query]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (el === null) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting === true) loadMore();
      },
      { rootMargin: '100px' },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [loadMore]);

  async function openInPanel(id: string): Promise<void> {
    const groupId = await api.ensureActiveGroup();
    await api.openAgentConversation({ id, groupId });
  }

  return (
    <div className="flex h-full flex-col bg-surface-system text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          <h1 className="text-base font-semibold">{t.title}</h1>
          <label htmlFor="agent-history-search" className="sr-only">
            {t.search}
          </label>
          <input
            id="agent-history-search"
            type="text"
            value={query}
            placeholder={t.search}
            spellCheck={false}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="ml-auto h-9 w-72 max-w-full rounded-full border border-border bg-surface-raised px-4 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          />
          <button
            type="button"
            onClick={() => void api.clearAgentConversations()}
            className={ACTION_CLASS}
          >
            {t.clear}
          </button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(18rem,24rem)_1fr] overflow-hidden px-8 py-4">
        <div className="overflow-auto border-r border-border pr-4">
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="py-2">
                <button
                  type="button"
                  onClick={() => void api.getAgentConversation(item.id).then(setSelected)}
                  className="w-full rounded-md px-2 py-2 text-left hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <p className="truncate text-sm font-medium text-text-primary">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{item.preview}</p>
                  <p className="mt-1 text-xs text-text-disabled">
                    {new Date(item.updatedAt).toLocaleString()} · {item.turnCount} {t.turns}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {hasMore && <div ref={sentinelRef} className="h-1" />}
          {loading && <p className="py-4 text-xs text-text-secondary">{t.loading}</p>}
          {!loading && items.length === 0 && (
            <p className="py-8 text-sm text-text-secondary">{t.empty}</p>
          )}
        </div>
        <div className="min-w-0 overflow-auto pl-6">
          {selected === null ? (
            <p className="py-8 text-sm text-text-secondary">{t.detailEmpty}</p>
          ) : (
            <article className="mx-auto max-w-3xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2 className="min-w-0 truncate text-lg font-semibold">{selected.summary.title}</h2>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => void openInPanel(selected.summary.id)}
                    className={ACTION_CLASS}
                  >
                    {t.openInPanel}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void api
                        .deleteAgentConversation(selected.summary.id)
                        .then(() => setSelected(null))
                    }
                    className={ACTION_CLASS}
                  >
                    {t.delete}
                  </button>
                </div>
              </div>
              <div className="space-y-4">
                {selected.turns.map((turn) => (
                  <section key={turn.id} className="space-y-2">
                    <div className="rounded-2xl rounded-br-sm bg-amber-500/15 px-3 py-2 text-sm">
                      {turn.prompt}
                    </div>
                    {turn.responseSummary !== undefined && (
                      <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm">
                        {turn.responseSummary}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

const ACTION_CLASS =
  'rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
