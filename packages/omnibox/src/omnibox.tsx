import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@tepegoz/ui';
import { evaluateOmniboxCalc } from './omnibox-calc';
import { parseOmniboxQuery } from './omnibox-suggest';
import type { OmniboxSuggestion } from './omnibox-suggest';
import { LEAD_GAP_PX, LEAD_INSET_PX, SiteInfoControl } from './omnibox-site-info';
import { EmphasizedText, SuggestionIcon } from './omnibox-suggestion-row';
import type { OmniboxProps } from './omnibox-types';

export type { OmniboxProps, OmniboxSecurityLabels, OmniboxSecurityLevel } from './omnibox-types';

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
  securityLevel,
  securityLabels,
  onOpenSiteInfo,
  placeholder,
  onNavigate,
  onCalcResult,
  focusToken,
  onSuggest,
  onActivateTab,
  onOpenQuickSetting,
  onAgentTask,
  onOpenDownload,
  onRunSkill,
  onOpenPalette,
  onDropdownHeightChange,
  className,
}: OmniboxProps) {
  const [value, setValue] = useState(currentUrl);
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<OmniboxSuggestion[]>([]);
  // KEYBOARD selection: -1 = nothing highlighted → Enter runs the default (calc copy / navigate the
  // typed text). Only the arrow keys write this, and only it backs `aria-activedescendant` + what
  // Enter opens — so moving the mouse can never re-target Enter or re-announce a row (omnibox § A10).
  const [selected, setSelected] = useState(-1);
  // POINTER hover: -1 = none. Written only by `onMouseEnter` / `onMouseLeave`; it tints a row but
  // never touches ARIA or Enter, and a live keyboard selection takes visual precedence over it.
  const [hovered, setHovered] = useState(-1);
  // Monotonic request id so a slow suggestion fetch can't overwrite a newer query's results, and a
  // just-closed dropdown can't be re-opened by a fetch that was already in flight (see below).
  const reqIdRef = useRef(0);
  // Handle for the pending debounce timer, so `closeSuggestions` can cancel a fetch that has not
  // fired yet — bumping `reqIdRef` alone does not, because the timer callback mints its own id.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listboxId = useId();

  // Keep the omnibox in sync with the active tab's URL, except while the user is editing it.
  useEffect(() => {
    if (!focused) setValue(currentUrl);
  }, [currentUrl, focused]);

  // Ctrl+L / Alt+D. The host bumps `focusToken`; selecting the text is the `onFocus` handler's job
  // already, which is why this is one line and why the shortcut behaves exactly like clicking in.
  useEffect(() => {
    if (focusToken === undefined || focusToken === 0) return;
    inputRef.current?.focus();
  }, [focusToken]);

  const calc = value.trim().length > 0 ? evaluateOmniboxCalc(value) : null;
  // A primitive mirror of `calc` for the effect below: `evaluateOmniboxCalc` returns a fresh object on
  // every render, so depending on `calc` directly spun the suggestion effect forever when the input
  // was arithmetic (new object → effect runs → `setSuggestions([])` → new array → re-render → new
  // object …). Typing "2+2" froze the renderer. Depend on the boolean instead.
  const isCalc = calc !== null;
  const open = focused && !isCalc && suggestions.length > 0;
  // The term to emphasise in each row — the typed text minus any `tab:` / `history:` scope prefix, so
  // a scoped search still bolds the part that actually matched. Structural, not a string: an empty
  // term just yields one unmatched segment.
  const matchTerm = parseOmniboxQuery(value).term;

  // The leading site-info control: shown for every classified level (a lock, a red "Not secure", a
  // gear for an app page) but not for `unknown` / no labels. `http://` and a bypassed certificate
  // also get the level word spelled in red next to the glyph, exactly as Chrome does.
  const siteLevel =
    securityLevel !== undefined && securityLevel !== 'unknown' && securityLabels !== undefined
      ? securityLevel
      : null;
  // The input's left padding is MEASURED from the control, never guessed. A fixed `pl-9` left the lock
  // ~2px from the text and its hover pill sat on the "h" of `https://`; a fixed `pl-[6.5rem]` for the
  // alarm state was sized for the English "Not secure" and is overrun by the Turkish "Guvenli degil".
  // Measuring covers every locale, font and zoom, and the ResizeObserver keeps it true when the word
  // changes or a webfont swaps in late.
  const leadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [leadWidth, setLeadWidth] = useState(0);
  useLayoutEffect(() => {
    const el = leadRef.current;
    if (el === null) {
      setLeadWidth(0);
      return undefined;
    }
    const measure = (): void => setLeadWidth(Math.ceil(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined; // jsdom without the polyfill
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [siteLevel]);

  // Fetch suggestions (debounced) as the user types. Arithmetic input shows the calc chip instead, so
  // we clear the dropdown then. The reqId guard drops out-of-order responses.
  useEffect(() => {
    if (!focused || onSuggest === undefined || isCalc || value.trim().length === 0) {
      // Bail out by identity — return the previous value untouched when it is already cleared, so this
      // branch can never be the thing that triggers another render.
      setSuggestions((prev) => (prev.length === 0 ? prev : []));
      setSelected((prev) => (prev === -1 ? prev : -1));
      setHovered((prev) => (prev === -1 ? prev : -1));
      return undefined;
    }
    const query = value;
    // Capture the generation now, at SCHEDULE time — not inside the timer. A `closeSuggestions()`
    // (row chosen, Enter, blur) between now and the fetch resolving bumps `reqIdRef`, so its result
    // fails this guard and cannot re-open a dropdown the user already dismissed.
    const reqId = ++reqIdRef.current;
    const timer = setTimeout(() => {
      void onSuggest(query).then(
        (next) => {
          if (reqIdRef.current === reqId) {
            setSuggestions(next);
            setSelected(-1);
            setHovered(-1);
          }
        },
        () => {
          if (reqIdRef.current === reqId) setSuggestions([]);
        },
      );
    }, SUGGEST_DEBOUNCE_MS);
    debounceRef.current = timer;
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
    reqIdRef.current++; // invalidate any in-flight fetch (its captured reqId no longer matches)
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current); // …and a debounce that has not fired yet
      debounceRef.current = null;
    }
    setSuggestions([]);
    setSelected(-1);
    setHovered(-1);
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
      case 'openPalette':
        onOpenPalette?.(s.action.query);
        break;
    }
  }

  function submitDefault(): void {
    // Submitting ends the suggestion session either way — tear the dropdown (and any pending fetch)
    // down so it cannot flash back open a moment later.
    closeSuggestions();
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
      setHovered(-1); // keyboard takes over the highlight unambiguously
      setSelected((i) => (i + 1 >= suggestions.length ? -1 : i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHovered(-1);
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
      {siteLevel !== null && (
        <div
          ref={leadRef}
          className="absolute left-1.5 top-1/2 z-10 -translate-y-1/2"
          style={{ maxWidth: 'calc(100% - 5rem)' }}
        >
          <SiteInfoControl level={siteLevel} labels={securityLabels!} onOpen={onOpenSiteInfo} />
        </div>
      )}
      <input
        ref={inputRef}
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
          // A floor under the measurement below: enough for the glyph alone, so the URL never starts
          // underneath the lock if the element has not been measured yet (first paint, no ResizeObserver).
          siteLevel !== null && 'pl-10',
        )}
        // Clear the leading control by its measured width (inset + width + gap), so the text starts
        // after the pill instead of underneath it.
        style={
          siteLevel !== null && leadWidth > 0
            ? { paddingLeft: LEAD_INSET_PX + leadWidth + LEAD_GAP_PX }
            : undefined
        }
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
          onMouseLeave={() => setHovered(-1)}
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-surface-raised py-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.key}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={i === selected}
              // Name the row from its own text, so a screen reader announces "Example Blog", not the
              // emphasis-fragmented "Exam… ple Blog" that the matched-substring `<span>`s would compute to.
              aria-label={s.subtitle !== undefined ? `${s.title} ${s.subtitle}` : s.title}
              // Choose on mousedown (before the input blurs) so the click isn't swallowed by the blur.
              onMouseDown={(e) => {
                e.preventDefault();
                dispatchSuggestion(s);
              }}
              // Hover tints the row but does NOT move the keyboard selection — see `hovered` vs
              // `selected` above (omnibox § A10).
              onMouseEnter={() => setHovered(i)}
              className={cn(
                'flex cursor-default items-center gap-3 px-4 py-1.5 text-sm',
                i === selected || (selected < 0 && i === hovered)
                  ? 'bg-surface-overlay'
                  : 'bg-transparent',
              )}
            >
              <SuggestionIcon kind={s.kind} faviconUrl={s.faviconUrl} />
              <EmphasizedText
                text={s.title}
                query={matchTerm}
                className="min-w-0 flex-1 truncate text-text-primary"
              />
              {s.subtitle !== undefined && (
                <EmphasizedText
                  text={s.subtitle}
                  query={matchTerm}
                  className="max-w-[45%] shrink-0 truncate text-xs text-text-secondary"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
