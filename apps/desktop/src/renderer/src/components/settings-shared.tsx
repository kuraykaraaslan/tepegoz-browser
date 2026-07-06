import type { ReactNode } from 'react';
import { LOCALE_PREFS, PROVIDER_IDS, THEME_PREFS } from '@tepegoz/desktop-ipc';
import type { LocalePref, ProviderId, ThemePref } from '@tepegoz/desktop-ipc';

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
  value,
  onChange,
  children,
}: {
  id: string;
  label?: string;
  value: string;
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
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="h-9 w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        {children}
      </select>
    </label>
  );
}
