import type { ReactNode } from 'react';
import { LOCALE_PREFS, PROVIDER_IDS, THEME_PREFS } from '@tepegoz/desktop-ipc';
import type { LocalePref, ProviderId, ThemePref } from '@tepegoz/desktop-ipc';
import { cn } from '@tepegoz/ui';

/**
 * Small pieces shared across the `settings-*.tsx` section files (split out of `SettingsPage.tsx`,
 * ADR-0010 250-line cap): the canonical value-list re-exports (single source in `@tepegoz/desktop-ipc`
 * / `@tepegoz/shared-types` — never locally duplicated) and the one shared `<select>` atom.
 */
export const PROVIDERS: readonly ProviderId[] = PROVIDER_IDS;
export const THEMES: readonly ThemePref[] = THEME_PREFS;
export const LOCALES: readonly LocalePref[] = LOCALE_PREFS;

/** A minimal styled native <select> (no Select atom in @tepegoz/ui yet). */
export function Select({
  id,
  label,
  ariaLabel,
  value,
  disabled = false,
  onChange,
  children,
}: {
  id: string;
  label?: string;
  /** Accessible name for a select with no VISIBLE label (e.g. one sitting inside a dense list row). */
  ariaLabel?: string;
  value: string;
  /** Really disabled, not merely greyed: a `pointer-events-none` wrapper still leaves the control in
   *  the tab order and fully operable from the keyboard. */
  disabled?: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label htmlFor={id} className="block">
      {label !== undefined && (
        <span className="mb-1 block text-sm font-medium text-text-primary">{label}</span>
      )}
      <select
        id={id}
        {...(ariaLabel !== undefined ? { 'aria-label': ariaLabel } : {})}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="h-[38px] w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
      >
        {children}
      </select>
    </label>
  );
}

/**
 * A list of mutually exclusive choices, each with the sentence that explains what picking it means.
 *
 * A `<select>` hides those sentences behind a click, which is wrong for the settings whose whole risk
 * lives in the difference between two options — agent autonomy being the clearest case. Real radio
 * inputs rather than styled buttons, so arrow keys move between options and a screen reader announces
 * "2 of 4" without any aria bookkeeping of our own.
 */
export function OptionList<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: readonly { value: T; title: string; desc: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((option) => {
        const active = option.value === value;
        const disabled = option.disabled === true;
        return (
          <label
            key={option.value}
            className={cn(
              'flex gap-3 rounded-lg border px-3 py-2.5 transition-colors',
              disabled
                ? 'cursor-not-allowed border-border opacity-55'
                : 'cursor-pointer hover:border-border-focus',
              active ? 'border-border-focus bg-surface-overlay' : 'border-border',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={active}
              disabled={disabled}
              onChange={() => {
                onChange(option.value);
              }}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-text-primary">{option.title}</span>
              <span className="mt-0.5 block text-xs text-text-secondary">{option.desc}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * A pointer to a control that lives on another settings page.
 *
 * A plain anchor to `#<section-id>`: the shell now keeps the active section in `location.hash`, so the
 * browser's own navigation does the work and the link behaves like a link — hoverable target, middle
 * click, copyable address. This exists because three "coming soon" placeholders were advertising
 * controls that had already shipped one page over; saying where they are is the fix, and a dead-end
 * paragraph would not have been one.
 */
export function CrossLink({ sectionId, children }: { sectionId: string; children: ReactNode }) {
  return (
    <a
      href={`#${sectionId}`}
      className="text-sm text-primary-on-surface underline decoration-border-strong underline-offset-2 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      {children}
    </a>
  );
}
