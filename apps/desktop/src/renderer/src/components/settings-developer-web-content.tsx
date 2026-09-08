import { settingsDict } from '@tepegoz/settings-ui';
import { Badge, Card } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { WEB_CONTENT_DEFAULTS } from '@tepegoz/shared-types/web-content-defaults';

/**
 * Read-only mirror of the `webPreferences` every browsed tab view is born with (ADR-0041 Tier C/D).
 * The table is `WEB_CONTENT_DEFAULTS` from `@tepegoz/shared-types`, kept in step with the code that
 * applies it (`browsedViewWebPreferences`) by a drift test. Editing the safe subset (`plugins`,
 * `backgroundThrottling`) is Tier C and not built yet; the four `locked` keys never become editable.
 */
export function WebContentDefaultsCard() {
  const s = useT(settingsDict);

  return (
    <Card title={s.webContentDefaultsTitle} subtitle={s.webContentDefaultsDesc}>
      <ul className="divide-y divide-border px-6 pb-5 pt-1">
        {WEB_CONTENT_DEFAULTS.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-3 py-2">
            <code className="text-xs text-text-primary">{d.key}</code>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-text-secondary">{String(d.value)}</span>
              {d.locked && <Badge variant="neutral">{s.webContentDefaultsLocked}</Badge>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
