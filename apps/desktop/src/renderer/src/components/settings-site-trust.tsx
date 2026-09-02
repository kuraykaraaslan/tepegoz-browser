import { useCallback, useEffect, useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Button, Card, Input } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { normalizeHostInput } from '@tepegoz/shared-types';
import { TRUST_LEVELS, type TrustLevel, type TrustProfile } from '@tepegoz/shared-types';
import { ConfirmAction } from './settings-confirm';
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
 *
 * Three things were wrong with the form around that sound design:
 *  - the validation error was painted with `text-danger`, and this project has no `danger` colour
 *    token — the class did nothing, so "invalid domain" rendered in body text and read as a caption;
 *  - every IPC call here dropped its rejection, so a failure left an empty list that looked exactly
 *    like "no sites trusted" — the most reassuring possible way to fail at showing standing grants;
 *  - the level could only be chosen while ADDING. Changing an existing site's level meant re-adding
 *    it, and the form's own regex was ASCII-only, so a Turkish user could not retype `köşe.com.tr`.
 */

export function SiteTrustSection() {
  const s = useT(settingsDict);
  const c = useT(coreDict);
  const t = s.siteTrust;
  const [profiles, setProfiles] = useState<TrustProfile[]>([]);
  const [domain, setDomain] = useState('');
  const [level, setLevel] = useState<TrustLevel>('trusted');
  const [error, setError] = useState('');

  /** One place for "the call failed": a standing security grant must never fail into a clean list. */
  const fail = useCallback(
    (err: unknown): void => {
      setError(err instanceof Error && err.message !== '' ? err.message : c.errors.upstreamDown);
    },
    [c.errors.upstreamDown],
  );

  useEffect(() => {
    void window.tepegoz.listTrustProfiles().then(setProfiles, fail);
  }, [fail]);

  function add(): void {
    const host = normalizeHostInput(domain);
    if (host === null) {
      setError(t.invalidDomain);
      return;
    }
    setError('');
    void window.tepegoz.setTrustProfile(host, level).then((next) => {
      setProfiles(next);
      setDomain('');
    }, fail);
  }

  function changeLevel(profile: TrustProfile, next: TrustLevel): void {
    setError('');
    void window.tepegoz.setTrustProfile(profile.domain, next).then(setProfiles, fail);
  }

  function remove(profile: TrustProfile): void {
    setError('');
    void window.tepegoz.removeTrustProfile(profile.domain).then(setProfiles, fail);
  }

  // The exact host that would be stored, shown while typing — so `köşe.com.tr` visibly becomes the
  // punycode the store keeps, rather than the user finding a row they do not recognise afterwards.
  const preview = normalizeHostInput(domain);
  const alreadyListed =
    preview !== null && profiles.some((profile) => profile.domain === preview);

  return (
    <Card title={t.title} subtitle={t.subtitle}>
      <div className="space-y-5">
        <div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                id="site-trust-domain"
                label={t.addLabel}
                placeholder={t.addPlaceholder}
                value={domain}
                onChange={(e) => {
                  setDomain(e.target.value);
                  setError('');
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
            <Button size="sm" className="h-[38px]" onClick={add}>
              {alreadyListed ? t.update : t.add}
            </Button>
          </div>
          {/* The hint sits BELOW the row so it can't stretch one field and knock the row out of
              alignment — it also carries the live "stored as <punycode>" preview while typing. */}
          <p className="mt-1 text-xs text-text-secondary">
            {preview !== null && preview !== domain.trim().toLowerCase()
              ? t.storedAs.replace('{domain}', preview)
              : t.addHint}
          </p>
          {error !== '' && <p className="mt-1 text-xs text-error">{error}</p>}
        </div>

        {profiles.length === 0 ? (
          <p className="text-sm text-text-secondary">{t.empty}</p>
        ) : (
          <ul className="space-y-1.5">
            {profiles.map((profile) => (
              <li
                key={profile.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate font-mono text-xs text-text-primary">
                    {profile.domain}
                  </span>
                  <span className="ml-2 text-xs text-text-secondary">
                    {t.levelHelp[profile.level]}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* The level is editable IN PLACE. It used to be settable only while adding, so
                      loosening or tightening one site meant re-adding it from memory. */}
                  <div className="w-36">
                    <Select
                      id={`site-trust-level-${profile.id}`}
                      ariaLabel={`${profile.domain} — ${t.levelLabel}`}
                      value={profile.level}
                      onChange={(v) => {
                        changeLevel(profile, v as TrustLevel);
                      }}
                    >
                      {TRUST_LEVELS.map((l) => (
                        <option key={l} value={l}>
                          {t.levels[l]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <ConfirmAction
                    label={t.remove}
                    title={t.removeTitle}
                    body={t.removeBody.replace('{domain}', profile.domain)}
                    confirmLabel={t.remove}
                    onConfirm={() => {
                      remove(profile);
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-text-secondary">{t.ceiling}</p>
      </div>
    </Card>
  );
}
