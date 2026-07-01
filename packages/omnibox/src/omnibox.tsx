import { useEffect, useState } from 'react';
import { cn } from '@tepegoz/ui';
import { evaluateOmniboxCalc } from './omnibox-calc';

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
  /** Extra classes for the wrapping form (e.g. `flex-1` for layout). */
  className?: string;
}

/**
 * `@tepegoz/omnibox` — the address bar (url-bar). Presentational + self-contained: it owns the typed
 * value, keeps it in sync with the active tab, and computes an inline arithmetic result. Navigation
 * and clipboard are injected via callbacks, so the package has no dependency on the Electron bridge.
 */
export function Omnibox({
  currentUrl,
  placeholder,
  onNavigate,
  onCalcResult,
  className,
}: OmniboxProps) {
  const [value, setValue] = useState(currentUrl);
  const [focused, setFocused] = useState(false);

  // Keep the omnibox in sync with the active tab's URL, except while the user is editing it.
  useEffect(() => {
    if (!focused) setValue(currentUrl);
  }, [currentUrl, focused]);

  const calc = value.trim().length > 0 ? evaluateOmniboxCalc(value) : null;

  return (
    <form
      className={cn('relative', className)}
      onSubmit={(e) => {
        e.preventDefault();
        // Inline calculation: if the whole input is arithmetic, surface the result instead of
        // navigating. Default side effect is a clipboard copy; hosts can override via onCalcResult.
        if (calc !== null) {
          if (onCalcResult) onCalcResult(calc.formatted);
          else void navigator.clipboard?.writeText(calc.formatted);
          setValue(calc.formatted);
          return;
        }
        onNavigate(value);
        // Keep focus (and the typed value) until navigation commits; the focus guard then re-syncs
        // to the real URL on blur. Blurring here would snap the box back to the OLD url mid-load.
      }}
    >
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        aria-label={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => setFocused(false)}
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
    </form>
  );
}
