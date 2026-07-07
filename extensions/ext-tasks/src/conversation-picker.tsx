import { useEffect, useState } from 'react';
import { Modal } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { AgentConversationDetail, AgentConversationSummary } from '@tepegoz/ext-agent/history';
import { tasksDict } from './i18n';
import type { TasksHostApi } from './types';

const PAGE_SIZE = 50;

interface ConversationPickerProps {
  api: TasksHostApi;
  open: boolean;
  onClose: () => void;
  onPick: (detail: AgentConversationDetail) => void;
}

export function ConversationPicker({ api, open, onClose, onPick }: ConversationPickerProps) {
  const t = useT(tasksDict).picker;
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AgentConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    void api.listAgentConversations({ query: query.trim(), offset: 0, limit: PAGE_SIZE }).then(
      (page) => {
        if (cancelled) return;
        setItems(page);
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
  }, [api, open, query]);

  async function pick(id: string): Promise<void> {
    const detail = await api.getAgentConversation(id);
    if (detail !== null) onPick(detail);
  }

  return (
    <Modal open={open} onClose={onClose} title={t.title} size="md">
      <div className="mt-4 space-y-3">
        <input
          type="text"
          value={query}
          placeholder={t.search}
          spellCheck={false}
          onChange={(e) => setQuery(e.currentTarget.value)}
          className="h-9 w-full rounded-full border border-border bg-surface-base px-4 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        />
        <div className="max-h-[60vh] overflow-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-text-secondary">{t.loading}</p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-secondary">{t.empty}</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void pick(item.id)}
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
          )}
        </div>
      </div>
    </Modal>
  );
}
