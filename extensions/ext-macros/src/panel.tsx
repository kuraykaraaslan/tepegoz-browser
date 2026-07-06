import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { macrosDict } from './i18n';
import type { MacrosHostApi } from './types';
import { MacrosCore } from './macro-panel-core';
import { BTN_GHOST } from './macro-step-helpers';

export interface MacrosSurfaceProps {
  api: MacrosHostApi;
  onClose: () => void;
}

/** Sidebar surface — "Macro Studio" (record + edit + run beside the visible page). */
export function MacrosPanel({ api, onClose }: MacrosSurfaceProps) {
  const t = useT(macrosDict);
  const c = useT(coreDict);
  return (
    <div className="flex h-full w-full flex-col bg-surface-base text-text-primary">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold">{t.studioTitle}</h2>
        <button type="button" onClick={onClose} aria-label={c.window.close} className={BTN_GHOST}>
          {c.window.close}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <MacrosCore api={api} />
      </div>
    </div>
  );
}

/** Page surface — "My Macros" at tepegoz://com.tepegoz.macros. */
export function MacrosPage({ api }: MacrosSurfaceProps) {
  const t = useT(macrosDict);
  return (
    <div className="flex h-full flex-col bg-surface-base text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <h1 className="mx-auto max-w-2xl text-base font-semibold">{t.managerTitle}</h1>
      </div>
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-2xl">
          <p className="mb-4 text-sm text-text-secondary">{t.description}</p>
          <MacrosCore api={api} />
        </div>
      </div>
    </div>
  );
}
