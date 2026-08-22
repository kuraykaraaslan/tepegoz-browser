import { useEffect, useState } from 'react';
import { Button, Card, Input } from '@tepegoz/ui';
import { settingsDict } from '@tepegoz/settings-ui';
import { useT } from '@tepegoz/i18n/react';
import { TRUST_LEVELS, type TrustLevel, type TrustProfile } from '@tepegoz/shared-types';
import { Select } from './settings-shared';

/**
 * Scoped Trust Profiles — the per-site standing posture, as a list the user can read and revoke.
 *
 * The screen shows the ceiling next to the list on purpose. "Trusted" reads, to most people, like
 * "anything goes"; it is not, and a settings screen that lets someone believe that has mis-set their
 * expectations even when the code behind it is correct. The sentence naming what still asks — money,
 * deletion, page-driven arguments, banking — is part of the feature, not decoration.
 *
 * Nothing here interprets a level. The renderer posts a domain and one of three words; `applyTrust` in
 * the main process decides what that word may change, and its invariant is that it can only tighten.
 */

/** Domain-only, matching the schema the main process validates against — no scheme, no path. */
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function SiteTrustSection() {
  const s = useT(settingsDict);
  const t = s.siteTrust;
  const [profiles, setProfiles] = useState<TrustProfile[]>([]);
  const [domain, setDomain] = useState('');
  const [level, setLevel] = useState<TrustLevel>('trusted');
  const [error, setError] = useState('');

  useEffect(() => {
    void window.tepegoz.listTrustProfiles().then(setProfiles);
  }, []);

  async function add(): Promise<void> {
    // Trim and lowercase before validating: someone typing a domain into a form types it the way they
    // read it, and rejecting `GitHub.com ` teaches nothing.
    const candidate = domain.trim().toLowerCase();
    if (!DOMAIN_RE.test(candidate)) {
      setError(t.invalidDomain);
      return;
    }
    setError('');
    setProfiles(await window.tepegoz.setTrustProfile(candidate, level));
    setDomain('');
  }

  return (
    <Card title={t.title} subtitle={t.subtitle}>
      <div className="space-y-5">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input
              id="site-trust-domain"
              label={t.addLabel}
              hint={t.addHint}
              placeholder={t.addPlaceholder}
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
              }}
            />
          </div>
          <div className="w-40">
            <Select
              id="site-trust-level"
              label={t.levelLabel}
              value={level}
              onChange={(v) => {
                setLevel(v as TrustLevel);
              }}
            >
              {TRUST_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {t.levels[l]}
                </option>
              ))}
            </Select>
          </div>
          <Button size="sm" onClick={() => void add()}>
            {t.add}
          </Button>
        </div>
        {error !== '' && <p className="text-xs text-danger">{error}</p>}

        {profiles.length === 0 ? (
          <p className="text-sm text-text-secondary">{t.empty}</p>
        ) : (
          <ul className="space-y-1.5">
            {profiles.map((profile) => (
              <li
                key={profile.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="truncate font-mono text-xs text-text-primary">
                    {profile.domain}
                  </span>
                  <span className="ml-2 text-xs text-text-secondary">
                    {t.levels[profile.level]} — {t.levelHelp[profile.level]}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void window.tepegoz.removeTrustProfile(profile.domain).then(setProfiles);
                  }}
                >
                  {t.remove}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-text-secondary">{t.ceiling}</p>
      </div>
    </Card>
  );
}
