import { Card } from '@tepegoz/ui';
import { settingsDict } from '@tepegoz/settings-ui';
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
 */
export function ShortcutsSection() {
  const s = useT(settingsDict);
  const t = s.shortcuts;
  const descriptions: Record<string, string> = t;
  const platform = window.tepegoz.platform;
  const all: readonly ShortcutSpec[] = SHORTCUTS;

  return (
    <Card title={t.title} subtitle={t.subtitle}>
      <ul className="space-y-1.5">
        {all.map((shortcut) => (
          <li
            key={shortcut.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
          >
            <span className="min-w-0 truncate text-sm text-text-primary">
              {descriptions[shortcut.id] ?? shortcut.id}
            </span>
            <kbd className="shrink-0 rounded border border-border bg-surface-raised px-2 py-0.5 font-mono text-xs text-text-secondary">
              {formatShortcut(shortcut, platform)}
            </kbd>
          </li>
        ))}
      </ul>
    </Card>
  );
}
