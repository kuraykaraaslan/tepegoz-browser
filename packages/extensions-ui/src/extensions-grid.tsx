import { useState, type ReactNode } from 'react';
import { foldForSearch } from '@tepegoz/i18n';
import { Card, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { extensionsDict } from './i18n';

/** One extension card. Hosts map their own extension/manifest objects into this shape. */
export interface ExtensionCardItem {
  id: string;
  icon: ReactNode;
  name: string;
  description: string;
  /** Small meta line under the toggle, e.g. "v0.1.0 · agent". */
  meta: string;
  enabled: boolean;
}

export interface ExtensionsGridProps {
  items: readonly ExtensionCardItem[];
  onToggle: (id: string, enabled: boolean) => void;
}

/**
 * `@tepegoz/extensions-ui` — the extensions manager shell (Chrome-style): a searchable grid of
 * extension cards, each with an enable/disable toggle. Owns its own dictionary (`useT(extensionsDict)`);
 * the extension list, manifest labels and enabled-state come from the host as `items`, so the package
 * carries no app-specific extension logic. Extracted from `apps/desktop` per docs/package-map.md.
 */
export function ExtensionsGrid({ items, onToggle }: ExtensionsGridProps) {
  const t = useT(extensionsDict);
  const [search, setSearch] = useState('');
  const q = foldForSearch(search.trim());
  const shown = items.filter((it) =>
    q.length === 0 ? true : foldForSearch(`${it.name} ${it.description}`).includes(q),
  );

  return (
    <div className="flex h-full flex-col bg-surface-system text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          <h1 className="text-base font-semibold">{t.title}</h1>
          <input
            type="text"
            value={search}
            placeholder={t.search}
            aria-label={t.search}
            spellCheck={false}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            className="ml-auto h-9 w-72 max-w-full rounded-full border border-border bg-surface-raised px-4 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((it) => (
            <Card key={it.id} variant="outline">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-text-secondary">
                  {it.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <Toggle
                    id={`ext-${it.id}`}
                    label={it.name}
                    description={it.description}
                    checked={it.enabled}
                    onChange={(v) => {
                      onToggle(it.id, v);
                    }}
                  />
                  <p className="mt-1 text-[11px] text-text-disabled">{it.meta}</p>
                </div>
              </div>
            </Card>
          ))}
          {shown.length === 0 && <p className="text-sm text-text-secondary">{t.empty}</p>}
        </div>
      </div>
    </div>
  );
}
