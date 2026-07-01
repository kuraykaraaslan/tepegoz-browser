import { useState } from 'react';
import { Card, Toggle } from '@tepegoz/ui';
import type { Resources } from '@tepegoz/i18n';
import {
  isExtensionEnabled,
  type ExtensionId,
  type ExtensionState,
} from '../../../shared/ipc-contract';
import { EXTENSIONS } from '../extensions/registry';

/**
 * Internal extensions manager (tepegoz://extensions), Chrome-style: a searchable grid of extension
 * cards, each with an enable/disable status toggle. Lists the built-in extensions from the registry;
 * real MV3/third-party extensions are a later phase.
 */
interface ExtensionsPageProps {
  t: Resources;
  states: readonly ExtensionState[];
  onToggle: (id: ExtensionId, enabled: boolean) => void;
}

export function ExtensionsPage({ t, states, onToggle }: ExtensionsPageProps) {
  const x = t.extensions;
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();

  const shown = EXTENSIONS.filter((ext) => {
    if (q.length === 0) return true;
    return `${x.names[ext.id]} ${ext.manifest.description}`.toLowerCase().includes(q);
  });

  return (
    <div className="flex h-full flex-col bg-surface-base text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          <h1 className="text-base font-semibold">{x.title}</h1>
          <input
            type="text"
            value={search}
            placeholder={x.search}
            aria-label={x.search}
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
          {shown.map((ext) => (
            <Card key={ext.id} variant="outline">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-text-secondary">
                  {ext.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <Toggle
                    id={`ext-${ext.id}`}
                    label={x.names[ext.id]}
                    description={ext.manifest.description}
                    checked={isExtensionEnabled(states, ext.id)}
                    onChange={(v) => {
                      onToggle(ext.id, v);
                    }}
                  />
                  <p className="mt-1 text-[11px] text-text-disabled">
                    v{ext.manifest.version} · {ext.manifest.id}
                  </p>
                </div>
              </div>
            </Card>
          ))}
          {shown.length === 0 && <p className="text-sm text-text-secondary">{x.empty}</p>}
        </div>
      </div>
    </div>
  );
}
