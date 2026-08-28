import { useState } from 'react';
import { Card, Input } from '@tepegoz/ui';
import { settingsDict } from '@tepegoz/settings-ui';
import { foldForSearch } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { formatShortcut, SHORTCUTS, type ShortcutSpec } from '@tepegoz/shortcuts';

/**
 * The keyboard-shortcut help list, rendered straight from the registry.
 *
 * Rendered from `SHORTCUTS` rather than from a hand-kept table, because a help list that is maintained
 * separately from the bindings is a help list that goes stale — and a stale one is worse than none,
 * since it teaches a key that does nothing. Adding a shortcut adds a row here; a parity test fails
 * until it has en+tr text.
 *
 * `formatShortcut` writes the platform's own notation (⌘⇧T on macOS, Ctrl+Shift+T elsewhere), taken
 * from the real `window.tepegoz.platform` rather than from a user-agent guess.
 *
 * The list is filterable, and the filter matches the KEYS as well as the descriptions — "ctrl+shift"
 * is how someone looks for the shortcut they half-remember, and folding runs through the same
 * diacritic-insensitive comparison the settings search uses, so `süz` finds `Suz`.
 */
export function ShortcutsSection() {
  const s = useT(settingsDict);
  const t = s.shortcuts;
  const platform = window.tepegoz.platform;
  const [filter, setFilter] = useState('');

  /** Descriptions live in their own group, so no shortcut id can collide with this section's own
   *  strings — see the note on `shortcuts.descriptions` in the dictionary. */
  const describe = (shortcut: ShortcutSpec): string =>
    (t.descriptions as Record<string, string>)[shortcut.id] ?? shortcut.id;

  const q = foldForSearch(filter.trim());
  const shown: readonly ShortcutSpec[] =
    q === ''
      ? SHORTCUTS
      : SHORTCUTS.filter((shortcut) =>
          foldForSearch(`${describe(shortcut)} ${formatShortcut(shortcut, platform)}`).includes(q),
        );

  return (
    <Card title={t.title} subtitle={t.subtitle}>
      <div className="mb-3">
        <Input
          id="shortcuts-filter"
          label={t.filterLabel}
          placeholder={t.filterPlaceholder}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
          }}
        />
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-text-secondary">{s.noResults}</p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((shortcut) => (
            <li
              key={shortcut.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
            >
              <span className="min-w-0 truncate text-sm text-text-primary">
                {describe(shortcut)}
              </span>
              <kbd className="shrink-0 rounded border border-border bg-surface-raised px-2 py-0.5 font-mono text-xs text-text-secondary">
                {formatShortcut(shortcut, platform)}
              </kbd>
            </li>
          ))}
        </ul>
      )}
      {/* Said out loud rather than left to be discovered: the list is fixed, and a user hunting for a
          "change this" affordance should not have to conclude it is hidden. */}
      <p className="mt-3 text-xs text-text-secondary">{t.notRebindable}</p>
    </Card>
  );
}
