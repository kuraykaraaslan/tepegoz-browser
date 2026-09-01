import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faClockRotateLeft,
  faGear,
  faMagnifyingGlass,
  faWindowMaximize,
} from '@fortawesome/free-solid-svg-icons';
import { cn } from '@tepegoz/ui';
import { evaluateOmniboxCalc } from './omnibox-calc';
import type { OmniboxQuickSettingTarget, OmniboxSuggestion } from './omnibox-suggest';

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
  /** Open a high-frequency settings panel (theme/language/privacy) from a deterministic suggestion. */
  onOpenQuickSetting?: ((target: OmniboxQuickSettingTarget) => void) | undefined;
  /**
   * Hand a task to the agent — reached ONLY from an explicitly typed `@agent`. This is the single
   * point where the omnibox crosses into AI, and it exists as its own callback (rather than folded
   * into `onNavigate`) so that the crossing is visible in the type, not buried in a string.
   */
  onAgentTask?: ((task: string) => void) | undefined;
  /** Open a download from `@download`. */
  onOpenDownload?: ((id: string) => void) | undefined;
  /** Run a saved skill from `@skill`. */
  onRunSkill?: ((id: string) => void) | undefined;
  /** Reports the rendered dropdown height so native hosts can manage WebContentsView layering. */
  onDropdownHeightChange?: ((height: number) => void) | undefined;
  /** Extra classes for the wrapping form (e.g. `flex-1` for layout). */
  className?: string;
}

/** Debounce (ms) before asking the host for suggestions — keeps typing snappy, avoids IPC per keystroke. */
const SUGGEST_DEBOUNCE_MS = 90;
const DROPDOWN_GAP_PX = 4; // Tailwind `mt-1`.
const FALLBACK_SUGGESTION_ROW_PX = 32;
const FALLBACK_LIST_CHROME_PX = 10; // py-1 + borders.

function dropdownHeight(list: HTMLUListElement | null, count: number): number {
  const measured = list?.getBoundingClientRect().height ?? 0;
  if (measured > 0) return Math.ceil(measured + DROPDOWN_GAP_PX);
  return count > 0
    ? count * FALLBACK_SUGGESTION_ROW_PX + FALLBACK_LIST_CHROME_PX + DROPDOWN_GAP_PX
    : 0;
}

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
  onOpenQuickSetting,
  onAgentTask,
  onOpenDownload,
  onRunSkill,
  onDropdownHeightChange,
  className,
}: OmniboxProps) {
  const [value, setValue] = useState(currentUrl);
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<OmniboxSuggestion[]>([]);
  // -1 = nothing highlighted → Enter runs the default (calc copy / navigate the typed text).
  const [selected, setSelected] = useState(-1);
  // Monotonic request id so a slow suggestion fetch can't overwrite a newer query's results.
  const reqIdRef = useRef(0);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listboxId = useId();

  // Keep the omnibox in sync with the active tab's URL, except while the user is editing it.
  useEffect(() => {
    if (!focused) setValue(currentUrl);
  }, [currentUrl, focused]);

  const calc = value.trim().length > 0 ? evaluateOmniboxCalc(value) : null;
  // A primitive mirror of `calc` for the effect below: `evaluateOmniboxCalc` returns a fresh object on
  // every render, so depending on `calc` directly spun the suggestion effect forever when the input
  // was arithmetic (new object → effect runs → `setSuggestions([])` → new array → re-render → new
  // object …). Typing "2+2" froze the renderer. Depend on the boolean instead.
  const isCalc = calc !== null;
  const open = focused && !isCalc && suggestions.length > 0;

  // Fetch suggestions (debounced) as the user types. Arithmetic input shows the calc chip instead, so
  // we clear the dropdown then. The reqId guard drops out-of-order responses.
  useEffect(() => {
    if (!focused || onSuggest === undefined || isCalc || value.trim().length === 0) {
      // Bail out by identity — return the previous value untouched when it is already cleared, so this
      // branch can never be the thing that triggers another render.
      setSuggestions((prev) => (prev.length === 0 ? prev : []));
      setSelected((prev) => (prev === -1 ? prev : -1));
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
  }, [value, focused, isCalc, onSuggest]);

  useLayoutEffect(() => {
    if (onDropdownHeightChange === undefined) return undefined;
    if (!open) {
      onDropdownHeightChange(0);
      return undefined;
    }
    const report = (): void => {
      onDropdownHeightChange(dropdownHeight(listRef.current, suggestions.length));
    };
    report();
    const list = listRef.current;
    if (list === null || typeof ResizeObserver === 'undefined') {
      return () => onDropdownHeightChange(0);
    }
    const observer = new ResizeObserver(report);
    observer.observe(list);
    window.addEventListener('resize', report);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
      onDropdownHeightChange(0);
    };
  }, [open, suggestions.length, onDropdownHeightChange]);

  function closeSuggestions(): void {
    reqIdRef.current++; // invalidate any in-flight fetch
    setSuggestions([]);
    setSelected(-1);
  }

  function dispatchSuggestion(s: OmniboxSuggestion): void {
    // `fillCommand` keeps the dropdown alive — it is a step toward a command, not the end of one.
    if (s.action.type !== 'fillCommand') closeSuggestions();
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
      case 'openQuickSetting':
        onOpenQuickSetting?.(s.action.target);
        break;
      case 'fillCommand':
        // Discovery, not execution: the box is filled and left open so the user types the argument.
        // An empty prefix means "there was nothing to pick" — leave what they typed alone.
        if (s.action.prefix.length > 0) setValue(s.action.prefix);
        break;
      case 'agentTask':
        onAgentTask?.(s.action.task);
        break;
      case 'openDownload':
        onOpenDownload?.(s.action.id);
        break;
      case 'runSkill':
        onRunSkill?.(s.action.id);
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
          ref={listRef}
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

/** A FontAwesome glyph per suggestion kind. */
function SuggestionIcon({ kind }: { kind: OmniboxSuggestion['kind'] }) {
  const icon =
    kind === 'tab'
      ? faWindowMaximize
      : kind === 'history'
        ? faClockRotateLeft
        : kind === 'quick-setting'
          ? faGear
          : faMagnifyingGlass;
  return (
    <FontAwesomeIcon icon={icon} className="h-3.5 w-3.5 shrink-0 text-text-secondary" aria-hidden />
  );
}
