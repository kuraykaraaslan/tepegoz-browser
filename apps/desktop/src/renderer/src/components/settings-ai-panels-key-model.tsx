import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faChevronDown, faGear } from '@fortawesome/free-solid-svg-icons';
import { settingsDict } from '@tepegoz/settings-ui';
import { useT } from '@tepegoz/i18n/react';
import { cn } from '@tepegoz/ui';
import type { AgentModelChoice, ProviderId } from '@tepegoz/desktop-ipc';

/**
 * The per-key model picker used by Providers & API keys — the model is pinned on the KEY (two Claude
 * keys can sit on different models), not on the provider. It appears only AFTER a key exists: a gear on
 * the key's row opens this menu. Split out of `settings-ai-panels-providers.tsx` (ADR-0010 250-line cap).
 *
 * The selectable models come from the agent config over IPC (`AgentModelChoice`), so the picker stays in
 * lockstep with the runtime's catalog without importing the model-gateway into the renderer.
 */

/** Selectable models per provider, from the runtime's catalog. Empty until the IPC call resolves. */
export function useProviderModels(): Map<ProviderId, AgentModelChoice['models']> {
  const [models, setModels] = useState<Map<ProviderId, AgentModelChoice['models']>>(new Map());

  useEffect(() => {
    void window.tepegoz.getAgentConfig().then(
      (cfg) => {
        setModels(new Map(cfg.choices.map((c) => [c.provider, c.models])));
      },
      () => {
        setModels(new Map());
      },
    );
  }, []);

  return models;
}

/** Trigger width — matches the `w-44` Select boxes elsewhere on this page so the rows line up. */
const TRIGGER_WIDTH = 176;
/** The panel is at least as wide as the trigger, plus room for the longest label ("Auto (recommended)"). */
const MENU_WIDTH = 224;

/**
 * One key's model control: a gear button showing the model in effect, opening a menu of that provider's
 * models. `''` = auto (per-task tier routing: a capable model for planning, a cheaper one for simple
 * steps). Choosing an entry saves immediately — there is no separate confirm, so the row can't sit in a
 * half-applied state. Renders nothing for a provider with no cloud catalog (`local` picks its model
 * under Settings → On-device models) or before the catalog has loaded.
 *
 * The menu is PORTALLED to `document.body` and positioned from the trigger's rect: `Card` clips its
 * children (`overflow-hidden`), so a menu positioned inside the row is cut off at the card's edge —
 * the same reason `FlagSelect` portals its panel out of the scrolling settings pane.
 */
export function KeyModelMenu({
  keyId,
  models,
  value,
  onChange,
}: {
  keyId: string;
  models: AgentModelChoice['models'] | undefined;
  value: string;
  onChange: (model: string) => void;
}) {
  const s = useT(settingsDict);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = `key-model-menu-${keyId}`;

  // Close on an outside click or Escape, and follow the trigger while the settings pane scrolls — a
  // portalled menu is NOT carried along by its row. Bound only while open, so a closed row costs nothing.
  useEffect(() => {
    if (!open) return undefined;
    const place = (): void => {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    };
    const onPointerDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) !== true &&
        document.getElementById(menuId)?.contains(target) !== true
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, menuId]);

  if (models === undefined || models.length === 0) return null;

  const current = models.find((m) => m.id === value);
  const options = [{ id: '', label: s.keyModel.auto }, ...models];

  const toggle = (): void => {
    if (!open && triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setOpen((v) => !v);
  };

  const choose = (model: string): void => {
    setOpen(false);
    triggerRef.current?.focus();
    if (model !== value) onChange(model);
  };

  const menu = open && rect !== null && (
    <div
      id={menuId}
      role="menu"
      aria-label={s.keyModel.label}
      style={{
        position: 'fixed',
        top: rect.bottom + 4,
        // Right-aligned to the gear, clamped so a row near the window edge can't push it off-screen.
        left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
        width: Math.max(MENU_WIDTH, rect.width),
        zIndex: 9999,
      }}
      className="overflow-hidden rounded-md border border-border bg-surface-raised shadow-lg"
    >
      <p className="border-b border-border px-3 py-2 text-xs text-text-secondary">
        {s.keyModel.menuHint}
      </p>
      <div className="py-1">
        {options.map((m) => (
          <button
            key={m.id === '' ? 'auto' : m.id}
            type="button"
            role="menuitemradio"
            aria-checked={m.id === value}
            onClick={() => {
              choose(m.id);
            }}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
              m.id === value
                ? 'bg-primary-subtle font-medium text-primary'
                : 'text-text-primary hover:bg-surface-overlay',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus',
            )}
          >
            <span className="flex-1 truncate">{m.label}</span>
            <FontAwesomeIcon
              icon={faCheck}
              className={cn('h-3 w-3 shrink-0', m.id === value ? 'text-primary' : 'invisible')}
              aria-hidden
            />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={`key-model-${keyId}`}
        aria-label={s.keyModel.label}
        aria-haspopup="menu"
        aria-expanded={open}
        {...(open ? { 'aria-controls': menuId } : {})}
        onClick={toggle}
        style={{ width: TRIGGER_WIDTH }}
        className={cn(
          'flex h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-surface-raised',
          'px-3 text-sm text-text-primary transition-colors hover:border-border-focus',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          open && 'border-border-focus',
        )}
      >
        <FontAwesomeIcon
          icon={faGear}
          className="h-3.5 w-3.5 shrink-0 text-text-secondary"
          aria-hidden
        />
        <span className="flex-1 truncate text-left">{current?.label ?? s.keyModel.autoShort}</span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className="h-3 w-3 shrink-0 text-text-disabled"
          aria-hidden
        />
      </button>
      {typeof document !== 'undefined' && createPortal(menu, document.body)}
    </>
  );
}
