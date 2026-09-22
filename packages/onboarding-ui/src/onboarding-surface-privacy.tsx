import { useT } from '@tepegoz/i18n/react';
import { Badge } from '@tepegoz/ui';
import { onboardingDict } from './i18n';

/**
 * Privacy/consent step. Two honest disclosures, not a settings duplicate:
 *
 * 1. Telemetry — reads the *real* `telemetryEnabled` preference rather than asserting a hardcoded
 *    "off" label, so this step can never say something Settings would contradict. The toggle itself
 *    stays in Settings (`SettingsPage-sections-privacy.tsx`); this step only shows the current value
 *    and points there, per the repo's no-duplicate-settings-feature convention.
 * 2. Sensitive-site lockout — describes a feature that is actually enforced today
 *    (`@tepegoz/security-policy`'s `sensitive-site.ts` + `policy-kernel.ts`), not a promise.
 */
export function PrivacyStep({ telemetryEnabled }: { telemetryEnabled: boolean }) {
  const t = useT(onboardingDict);
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-surface-raised p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{t.privacyTelemetryTitle}</h3>
          <Badge variant={telemetryEnabled ? 'warning' : 'success'}>
            {telemetryEnabled ? t.privacyTelemetryOn : t.privacyTelemetryOff}
          </Badge>
        </div>
        <p className="text-sm leading-6 text-text-secondary">{t.privacyTelemetryBody}</p>
        <p className="mt-2 text-xs leading-5 text-text-secondary">{t.privacyTelemetrySettingsHint}</p>
      </div>
      <div className="rounded-lg border border-border bg-surface-base p-6">
        <h3 className="text-lg font-semibold">{t.privacySensitiveTitle}</h3>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{t.privacySensitiveBody}</p>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-secondary max-sm:grid-cols-1">
          {t.privacySensitiveCategories.map((category) => (
            <li key={category} className="flex items-center gap-2">
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-secondary" />
              {category}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
