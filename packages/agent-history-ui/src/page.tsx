import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import type {
  AgentConversationDetail,
  AgentConversationSummary,
  AgentConversationsState,
} from '@tepegoz/agent-history';
import { agentHistoryDict } from './i18n';

const PAGE_SIZE = 50;

export interface AgentHistoryPageProps {
  list: (query: string, offset: number) => Promise<AgentConversationSummary[]>;
  get: (id: string) => Promise<AgentConversationDetail | null>;
  open: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  subscribe: (callback: (state: AgentConversationsState) => void) => () => void;
}

export function AgentHistoryPage(props: Readonly<AgentHistoryPageProps>) {
  const { clear, get, list, open, remove, subscribe } = props;
  const t = useT(agentHistoryDict);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AgentConversationSummary[]>([]);
  const [selected, setSelected] = useState<AgentConversationDetail | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => subscribe((state) => setItems(state.items)), [subscribe]);

  useEffect(() => {
    let cancelled = false;
    loadingRef.current = true;
    setLoading(true);
    void list(query.trim(), 0).then((page) => {
      if (cancelled) return;
      loadingRef.current = false;
      setItems(page);
      setOffset(page.length);
      setHasMore(page.length === PAGE_SIZE);
      setLoading(false);
    }, () => {
      if (cancelled) return;
      loadingRef.current = false;
      setItems([]);
      setOffset(0);
      setHasMore(false);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [query, list]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    void list(query.trim(), offset).then((page) => {
      loadingRef.current = false;
      setItems((prev) => [...prev, ...page]);
      setOffset((prev) => prev + page.length);
      setHasMore(page.length === PAGE_SIZE);
      setLoading(false);
    }, () => {
      loadingRef.current = false;
      setLoading(false);
    });
  }, [hasMore, offset, list, query]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (el === null) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting === true) loadMore();
    }, { rootMargin: '100px' });
    observer.observe(el);
    return () => { observer.disconnect(); };
  }, [loadMore]);

  async function selectConversation(id: string): Promise<void> {
    setSelected(await get(id));
  }

  return (
    <div className="flex h-full flex-col bg-surface-system text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          <h1 className="text-base font-semibold">{t.title}</h1>
          <label htmlFor="agent-history-search" className="sr-only">{t.search}</label>
          <input
            id="agent-history-search"
            type="text"
            value={query}
            placeholder={t.search}
            spellCheck={false}
            onChange={(e) => setQuery(e.currentTarget.value)}
            className="ml-auto h-9 w-72 max-w-full rounded-full border border-border bg-surface-raised px-4 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          />
          <button
            type="button"
            onClick={() => void clear().then(() => { setItems([]); setSelected(null); })}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
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
                  onClick={() => void selectConversation(item.id)}
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
          {!loading && items.length === 0 && <p className="py-8 text-sm text-text-secondary">{t.empty}</p>}
        </div>
        <div className="min-w-0 overflow-auto pl-6">
          {selected === null ? (
            <p className="py-8 text-sm text-text-secondary">{t.detailEmpty}</p>
          ) : (
            <ConversationDetail
              detail={selected}
              labels={{ open: t.openInPanel, remove: t.delete }}
              onOpen={() => void open(selected.summary.id)}
              onRemove={() => void remove(selected.summary.id).then(() => setSelected(null))}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationDetail({
  detail,
  labels,
  onOpen,
  onRemove,
}: {
  detail: AgentConversationDetail;
  labels: { open: string; remove: string };
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <article className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{detail.summary.title}</h2>
          <p className="mt-1 text-xs text-text-secondary">
            {new Date(detail.summary.updatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onOpen} className={ACTION_CLASS}>{labels.open}</button>
          <button type="button" onClick={onRemove} className={ACTION_CLASS}>{labels.remove}</button>
        </div>
      </div>
      <div className="space-y-4">
        {detail.turns.map((turn) => (
          <section key={turn.id} className="space-y-2">
            <div className="rounded-2xl rounded-br-sm bg-amber-500/15 px-3 py-2 text-sm">
              {turn.prompt}
            </div>
            {turn.responseSummary !== undefined && (
              <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary">
                {turn.responseSummary}
              </div>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}

const ACTION_CLASS =
  'rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
