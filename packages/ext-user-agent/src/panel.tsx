import { useEffect, useMemo, useState } from 'react';
import { cn } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { userAgentDict } from './i18n';
import { USER_AGENT_PRESETS, matchPreset, type UserAgentPreset } from './presets';
import type { UserAgentHostApi } from './types';

/**
 * User-Agent switcher surfaces. The stateful picker ({@link UserAgentPicker}) lists the built-in
 * {@link USER_AGENT_PRESETS} and lets the user apply one — or paste a custom UA string — for the
 * browsing session; applying reloads open tabs so the new identity takes effect. It talks to the host
 * ONLY through the injected {@link UserAgentHostApi} (no global bridge). The chrome hosts it as either
 * a `popup` (compact card under the toolbar icon) or a `page` (tepegoz://com.tepegoz.user-agent).
 */
export interface UserAgentSurfaceProps {
  api: UserAgentHostApi;
  onClose: () => void;
}

const BTN_PRIMARY =
  'rounded-md bg-surface-overlay px-3 py-1.5 text-sm font-medium text-text-primary ' +
  'hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
const BTN_GHOST =
  'rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

/** The stateful picker core, shared by every surface. Renders no chrome of its own. */
export function UserAgentPicker({ api }: { api: UserAgentHostApi }) {
  const x = useT(userAgentDict);
  // `current` is the applied selection (UA string or null = default); null until loaded.
  const [current, setCurrent] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void api.getUserAgent().then(
      (ua) => {
        if (!alive) return;
        setCurrent(ua);
        if (ua !== null && matchPreset(ua) === undefined) setCustom(ua);
        setLoaded(true);
      },
      () => {
        if (alive) setLoaded(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [api]);

  const activePreset = useMemo(() => matchPreset(current), [current]);
  const customActive = loaded && current !== null && activePreset === undefined;

  function presetLabel(preset: UserAgentPreset): string {
    return preset.ua === null ? x.default : preset.label;
  }

  async function apply(ua: string | null): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const stored = await api.setUserAgent(ua);
      setCurrent(stored);
      if (stored !== null && matchPreset(stored) === undefined) setCustom(stored);
    } catch {
      /* the host rejected/failed — leave the current selection unchanged */
    } finally {
      setBusy(false);
    }
  }

  function applyCustom(): void {
    const ua = custom.trim();
    if (ua.length === 0) return;
    void apply(ua);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">{x.description}</p>

      <div>
        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">
          {x.current}
        </h3>
        <p className="break-words rounded-md border border-border bg-surface-raised px-3 py-2 font-mono text-xs text-text-primary">
          {!loaded ? '…' : current === null ? x.default : current}
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
          {x.presets}
        </h3>
        <ul className="space-y-1.5">
          {USER_AGENT_PRESETS.map((preset) => {
            const isActive = loaded && !customActive && activePreset?.id === preset.id;
            return (
              <li key={preset.id}>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={isActive}
                  onClick={() => {
                    void apply(preset.ua);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50',
                    isActive
                      ? 'border-border-focus bg-surface-overlay text-text-primary'
                      : 'border-border text-text-secondary hover:bg-surface-overlay hover:text-text-primary',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-text-primary">{presetLabel(preset)}</span>
                    {preset.ua !== null && (
                      <span className="block truncate font-mono text-xs text-text-secondary">
                        {preset.ua}
                      </span>
                    )}
                  </span>
                  {isActive && (
                    <span className="shrink-0 rounded-full bg-surface-base px-2 py-0.5 text-xs text-text-secondary">
                      {x.active}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
          {x.custom}
        </h3>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            applyCustom();
          }}
        >
          <input
            type="text"
            value={custom}
            spellCheck={false}
            placeholder={x.customPlaceholder}
            aria-label={x.custom}
            onChange={(e) => {
              setCustom(e.target.value);
            }}
            className="h-9 flex-1 rounded-md border border-border bg-surface-raised px-3 font-mono text-xs text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          />
          <button type="submit" disabled={busy || custom.trim().length === 0} className={BTN_PRIMARY}>
            {x.apply}
          </button>
        </form>
        {customActive && <p className="mt-1.5 text-xs text-text-secondary">{x.customInUse}</p>}
      </div>

      <p className="text-xs text-text-secondary">{x.reloadNote}</p>
    </div>
  );
}

/** Popup surface — a compact card. Width/height are clamped by the chrome host, not the extension. */
export function UserAgentPopup({ api, onClose }: UserAgentSurfaceProps) {
  const ua = useT(userAgentDict);
  const c = useT(coreDict);
  return (
    <div className="flex w-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold text-text-primary">{ua.title}</h2>
        <button type="button" onClick={onClose} aria-label={c.window.close} className={BTN_GHOST}>
          {c.window.close}
        </button>
      </div>
      <div className="p-3">
        <UserAgentPicker api={api} />
      </div>
    </div>
  );
}

/** Page surface — full internal page at tepegoz://com.tepegoz.user-agent. */
export function UserAgentPage({ api }: UserAgentSurfaceProps) {
  const ua = useT(userAgentDict);
  return (
    <div className="flex h-full flex-col bg-surface-base text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <h1 className="mx-auto max-w-2xl text-base font-semibold">{ua.title}</h1>
      </div>
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-2xl">
          <UserAgentPicker api={api} />
        </div>
      </div>
    </div>
  );
}
