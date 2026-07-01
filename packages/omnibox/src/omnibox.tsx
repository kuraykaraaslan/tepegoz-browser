import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@tepegoz/ui';
import { evaluateOmniboxCalc } from './omnibox-calc';
import type { OmniboxSuggestion } from './omnibox-suggest';

export interface OmniboxProps {
  /** The active tab's committed URL. The box re-syncs to this whenever the user is not editing it. */
  currentUrl: string;
  /** Placeholder + aria-label text. Supplied by the host so the package stays i18n-agnostic. */
  placeholder: string;
  /** Called when the user submits a real navigation (Enter on a non-arithmetic value). */
  onNavigate: (input: string) => void;
  /**
   * Called when the whole input is arithmetic and the user submits — the omnibox never starts an AI
   * thread or a search for a calculation (Comet lesson). Defaults to copying the result to the
   * clipboard. The box always shows the computed result regardless.
   */
  onCalcResult?: (formatted: string) => void;
  /**
   * Async suggestion source (host fetches history/tabs and composes them with
   * `buildOmniboxSuggestions`). Called as the user types; return an ordered list. Omit to disable the
   * suggestions dropdown. The omnibox stays deterministic — suggestions never start an AI thread.
   */
  onSuggest?: ((query: string) => Promise<OmniboxSuggestion[]>) | undefined;
  /** Switch to an already-open tab (dispatched for `activateTab` suggestions). */
  onActivateTab?: ((tabId: string) => void) | undefined;
  /** Extra classes for the wrapping form (e.g. `flex-1` for layout). */
  className?: string;
}

/** Debounce (ms) before asking the host for suggestions — keeps typing snappy, avoids IPC per keystroke. */
const SUGGEST_DEBOUNCE_MS = 90;

/**
 * `@tepegoz/omnibox` — the address bar (url-bar). Presentational + self-contained: it owns the typed
 * value, keeps it in sync with the active tab, computes an inline arithmetic result, and shows a
 * deterministic unified-suggestions dropdown (history/tab/search) driven by an injected `onSuggest`.
 * Navigation, tab-switching and clipboard are injected via callbacks, so the package has no dependency
 * on the Electron bridge.
 */
export function Omnibox({
  currentUrl,
  placeholder,
  onNavigate,
  onCalcResult,
  onSuggest,
  onActivateTab,
  className,
}: OmniboxProps) {
  const [value, setValue] = useState(currentUrl);
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<OmniboxSuggestion[]>([]);
  // -1 = nothing highlighted → Enter runs the default (calc copy / navigate the typed text).
  const [selected, setSelected] = useState(-1);
  // Monotonic request id so a slow suggestion fetch can't overwrite a newer query's results.
  const reqIdRef = useRef(0);
  const listboxId = useId();

  // Keep the omnibox in sync with the active tab's URL, except while the user is editing it.
  useEffect(() => {
    if (!focused) setValue(currentUrl);
  }, [currentUrl, focused]);

  const calc = value.trim().length > 0 ? evaluateOmniboxCalc(value) : null;
  const open = focused && calc === null && suggestions.length > 0;

  // Fetch suggestions (debounced) as the user types. Arithmetic input shows the calc chip instead, so
  // we clear the dropdown then. The reqId guard drops out-of-order responses.
  useEffect(() => {
    if (!focused || onSuggest === undefined || calc !== null || value.trim().length === 0) {
      setSuggestions([]);
      setSelected(-1);
      return undefined;
    }
    const query = value;
    const timer = setTimeout(() => {
      const reqId = ++reqIdRef.current;
      void onSuggest(query).then(
        (next) => {
          if (reqIdRef.current === reqId) {
            setSuggestions(next);
            setSelected(-1);
          }
        },
        () => {
          if (reqIdRef.current === reqId) setSuggestions([]);
        },
      );
    }, SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, focused, calc, onSuggest]);

  function closeSuggestions(): void {
    reqIdRef.current++; // invalidate any in-flight fetch
    setSuggestions([]);
    setSelected(-1);
  }

  function dispatchSuggestion(s: OmniboxSuggestion): void {
    closeSuggestions();
    switch (s.action.type) {
      case 'navigate':
        onNavigate(s.action.input);
        break;
      case 'activateTab':
        onActivateTab?.(s.action.tabId);
        break;
      case 'calc':
        if (onCalcResult) onCalcResult(s.action.formatted);
        else void navigator.clipboard?.writeText(s.action.formatted);
        break;
    }
  }

  function submitDefault(): void {
    // Inline calculation: if the whole input is arithmetic, surface the result instead of navigating.
    if (calc !== null) {
      if (onCalcResult) onCalcResult(calc.formatted);
      else void navigator.clipboard?.writeText(calc.formatted);
      setValue(calc.formatted);
      return;
    }
    onNavigate(value);
    // Keep focus (and the typed value) until navigation commits; the focus guard then re-syncs to the
    // real URL on blur. Blurring here would snap the box back to the OLD url mid-load.
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => (i + 1 >= suggestions.length ? -1 : i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => (i <= -1 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSuggestions();
    }
  }

  return (
    <form
      className={cn('relative', className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (selected >= 0 && selected < suggestions.length) {
          dispatchSuggestion(suggestions[selected]!);
          return;
        }
        submitDefault();
      }}
    >
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        aria-label={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && selected >= 0 ? `${listboxId}-opt-${selected}` : undefined}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          closeSuggestions();
        }}
        className={cn(
          'h-8 w-full rounded-full border border-border bg-surface-base px-4 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          calc !== null && 'pr-24',
        )}
      />
      {calc !== null && (
        <span
          aria-live="polite"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded bg-surface-overlay px-2 py-0.5 font-mono text-xs text-text-secondary"
        >
          = {calc.formatted}
        </span>
      )}
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-surface-raised py-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.key}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={i === selected}
              // Choose on mousedown (before the input blurs) so the click isn't swallowed by the blur.
              onMouseDown={(e) => {
                e.preventDefault();
                dispatchSuggestion(s);
              }}
              onMouseEnter={() => setSelected(i)}
              className={cn(
                'flex cursor-default items-center gap-3 px-4 py-1.5 text-sm',
                i === selected ? 'bg-surface-overlay' : 'bg-transparent',
              )}
            >
              <SuggestionIcon kind={s.kind} />
              <span className="min-w-0 flex-1 truncate text-text-primary">{s.title}</span>
              {s.subtitle !== undefined && (
                <span className="max-w-[45%] shrink-0 truncate text-xs text-text-secondary">
                  {s.subtitle}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

/** A tiny inline glyph per suggestion kind (no icon-font dependency — the omnibox is a leaf). */
function SuggestionIcon({ kind }: { kind: OmniboxSuggestion['kind'] }) {
  const common = 'h-3.5 w-3.5 shrink-0 text-text-secondary';
  if (kind === 'tab') {
    return (
      <svg className={common} viewBox="0 0 16 16" aria-hidden="true">
        <rect
          x="2"
          y="3"
          width="12"
          height="10"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path d="M2 6 H14" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  if (kind === 'history') {
    return (
      <svg className={common} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M8 5 V8 L10 9.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  // navigate + search both show a magnifier-ish / globe glyph; a search magnifier reads best here.
  return (
    <svg className={common} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10.5 10.5 L14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
