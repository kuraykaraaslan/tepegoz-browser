import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faBell,
  faClipboard,
  faLocationDot,
  faMicrophone,
  faPaste,
  faVideo,
} from '@fortawesome/free-solid-svg-icons';
import type { settingsDict } from '@tepegoz/settings-ui';
import type { SitePermissionState, WebPermissionCapability } from '@tepegoz/shared-types';
import type { PageInfo } from '@tepegoz/desktop-ipc';
import type { SiteInfoStrings } from './SiteInfoCertificate';

/** A glyph per brokered capability, so a permission row reads at a glance (Chrome's row icons). */
const CAPABILITY_ICON: Record<WebPermissionCapability, IconDefinition> = {
  camera: faVideo,
  microphone: faMicrophone,
  geolocation: faLocationDot,
  notifications: faBell,
  clipboardRead: faClipboard,
  clipboardWrite: faPaste,
};

const LINK = 'text-xs font-medium text-primary-on-surface hover:underline';

/** The Permissions Center strings (capability / state labels) this section reuses. */
type PermissionStrings = (typeof settingsDict)['en']['permissionsCenter'];

/**
 * The panel's permissions list — only capabilities this site asked for or the user already decided.
 * Writes are delegated to the caller (the same `updatePreferences` path the Permissions Center uses).
 */
export function PermissionsSection({
  permissions,
  t,
  s,
  onChange,
  onReset,
}: {
  permissions: PageInfo['permissions'];
  t: SiteInfoStrings;
  s: PermissionStrings;
  onChange: (capability: WebPermissionCapability, state: SitePermissionState) => void;
  onReset: () => void;
}) {
  return (
    <section className="border-t border-border px-4 py-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {t.permissionsTitle}
      </p>
      <ul className="space-y-1.5">
        {permissions.map((p) => (
          <li key={p.capability} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2.5 text-xs text-text-primary">
              <FontAwesomeIcon
                icon={CAPABILITY_ICON[p.capability]}
                className="h-3.5 w-3.5 shrink-0 text-text-secondary"
                aria-hidden
              />
              <span className="truncate">{s.capability[p.capability]}</span>
            </span>
            <select
              aria-label={s.capability[p.capability]}
              value={p.state}
              onChange={(e) => onChange(p.capability, e.target.value as SitePermissionState)}
              className="h-7 w-32 shrink-0 rounded-md border border-border bg-surface-raised px-2 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              {(['prompt', 'allowed', 'denied'] as SitePermissionState[]).map((st) => (
                <option key={st} value={st}>
                  {s.state[st]}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      {permissions.some((p) => p.state !== 'prompt') && (
        <button type="button" onClick={onReset} className={`mt-2.5 ${LINK}`}>
          {t.resetPermissions}
        </button>
      )}
    </section>
  );
}
