import type { SettingsStrings } from '@tepegoz/settings-ui';
import type { Preferences, SecureDnsMode, SecureDnsProvider } from '@tepegoz/desktop-ipc';
import { isSecureDnsServerUrl } from '@tepegoz/shared-types';
import { Input } from '@tepegoz/ui';
import { useCommitOnPause } from '../lib/use-commit-on-pause';
import { Select } from './settings-shared';

/**
 * Secure DNS (DNS over HTTPS): a mode, a provider, and — for a custom server — its address.
 *
 * The provider and address only appear once the mode is on, since neither does anything while it is off.
 * A custom address is stored only when it is a valid https URL (the preference schema would refuse
 * anything else, and a silently failed write would leave the box showing text that is not saved); until
 * it is valid the field says so, and main falls back to the system resolver rather than to a secure mode
 * with no server.
 */
export function SecureDnsRow({
  s,
  prefs,
  setPref,
}: {
  s: SettingsStrings;
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const t = s.secureDns;
  const custom = useCommitOnPause(prefs.secureDnsCustomUrl, (value) => {
    const trimmed = value.trim();
    if (trimmed === '' || isSecureDnsServerUrl(trimmed)) setPref({ secureDnsCustomUrl: trimmed });
  });
  const customInvalid = custom.draft.trim() !== '' && !isSecureDnsServerUrl(custom.draft);
  const on = prefs.secureDnsMode !== 'off';

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-sm font-medium text-text-primary">{t.title}</p>
        <p className="mb-3 text-xs text-text-secondary">{t.desc}</p>
        <Select
          id="secure-dns-mode"
          label={t.modeLabel}
          value={prefs.secureDnsMode}
          onChange={(v) => {
            setPref({ secureDnsMode: v as SecureDnsMode });
          }}
        >
          <option value="off">{t.modeOff}</option>
          <option value="automatic">{t.modeAutomatic}</option>
          <option value="secure">{t.modeSecure}</option>
        </Select>
      </div>
      {on && (
        <Select
          id="secure-dns-provider"
          label={t.providerLabel}
          value={prefs.secureDnsProvider}
          onChange={(v) => {
            setPref({ secureDnsProvider: v as SecureDnsProvider });
          }}
        >
          <option value="cloudflare">{t.providerCloudflare}</option>
          <option value="google">{t.providerGoogle}</option>
          <option value="quad9">{t.providerQuad9}</option>
          <option value="custom">{t.providerCustom}</option>
        </Select>
      )}
      {on && prefs.secureDnsProvider === 'custom' && (
        <Input
          id="secure-dns-custom-url"
          type="url"
          label={t.customUrlLabel}
          hint={t.customUrlHint}
          placeholder={t.customUrlPlaceholder}
          value={custom.draft}
          {...(customInvalid ? { error: t.customUrlInvalid } : {})}
          onChange={(e) => {
            custom.set(e.target.value);
          }}
          onBlur={custom.flush}
        />
      )}
    </div>
  );
}
