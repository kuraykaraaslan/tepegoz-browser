import { settingsDict } from '@tepegoz/settings-ui';
import { Card, Toggle } from '@tepegoz/ui';
import { useLocale, useT } from '@tepegoz/i18n/react';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { ConfirmAction } from './settings-confirm';
import { CrossLink, Select } from './settings-shared';

/**
 * Accessibility — the page that was a `ComingSoonCard` while the product claimed WCAG 2.2 AA.
 *
 * Two real controls, both of which already had most of their machinery:
 *  - **Default page zoom.** Per-site zoom has been persisted since Phase 2c, but the level a site got
 *    when it had none of its own was the constant `1`. Making that a preference turns "make every page
 *    a bit bigger" from a per-site chore into one setting, and per-site levels keep working on top of
 *    it — a site left at the user's own default stores nothing, exactly as a site left at 100% did.
 *  - **Reduced motion.** `tokens.css` honours the OS's `prefers-reduced-motion` regardless; this only
 *    ever ADDS a reason to reduce it, for the machine whose OS says one thing and whose user wants
 *    another. Turning it off hands the decision back to the OS rather than forcing motion on.
 *
 * What is deliberately NOT here: a minimum font size. That is a `webPreferences` field fixed when a
 * `WebContentsView` is constructed, so it would need every open tab recreated to change — a control
 * that silently only applied to tabs opened afterwards would be worse than none.
 */

/** Chrome's own zoom stops, which is what makes the steps feel familiar rather than arbitrary. */
const ZOOM_CHOICES = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

export function AccessibilitySection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  const t = s.accessibility;
  const locale = useLocale();

  const perSiteCount = Object.keys(prefs.siteZoomFactors).length;
  const percent = (factor: number): string =>
    `${Math.round(factor * 100).toLocaleString(locale)}%`;

  return (
    <div className="space-y-6">
      <Card title={t.title} subtitle={t.subtitle}>
        <div className="space-y-5">
          <div className="max-w-xs">
            <Select
              id="default-page-zoom"
              label={t.pageZoom}
              value={String(prefs.defaultPageZoom)}
              onChange={(v) => {
                const factor = Number(v);
                if (Number.isFinite(factor)) setPref({ defaultPageZoom: factor });
              }}
            >
              {ZOOM_CHOICES.map((factor) => (
                <option key={factor} value={String(factor)}>
                  {percent(factor)}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-text-secondary">{t.pageZoomHint}</p>
          </div>

          {perSiteCount > 0 && (
            <div>
              <p className="mb-2 text-xs text-text-secondary">
                {t.perSiteCount.replace('{count}', String(perSiteCount))}
              </p>
              <ConfirmAction
                label={t.clearPerSite}
                title={t.clearPerSite}
                body={t.clearPerSiteBody.replace('{count}', String(perSiteCount))}
                confirmLabel={t.clearPerSite}
                onConfirm={() => {
                  setPref({ siteZoomFactors: {} });
                }}
              />
            </div>
          )}

          <Toggle
            id="reduce-motion"
            label={t.reduceMotion}
            description={t.reduceMotionDesc}
            checked={prefs.reduceMotion}
            onChange={(v) => {
              setPref({ reduceMotion: v });
            }}
          />
        </div>
      </Card>

      <Card title={t.elsewhereTitle} subtitle={t.elsewhereHint}>
        <ul className="space-y-2">
          <li>
            <CrossLink sectionId="appearance">{t.linkTheme}</CrossLink>
          </li>
          <li>
            <CrossLink sectionId="shortcuts">{t.linkShortcuts}</CrossLink>
          </li>
        </ul>
      </Card>
    </div>
  );
}
