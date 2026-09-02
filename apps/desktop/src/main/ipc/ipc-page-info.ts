import { BrowserWindow } from 'electron';
import { Logger } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { PageInfoGetSchema } from '@tepegoz/desktop-ipc/schemas';
import {
  WEB_PERMISSION_CAPABILITIES,
  classifyPageSecurity,
  type PageInfo,
  type PageSitePermission,
} from '@tepegoz/shared-types';
import TabManager from '../tabs';
import BrowsingSessions from '../network/browsing-sessions.electron';
import { getRecordedCert, toCertificateSummary } from '../network/certificate-recorder.electron';
import { hasCertificateException } from '../auth/certificate-broker';
import { listTrustProfiles } from '../security/trust-profile-host.electron';
import { requestedCapabilities } from '../web-permissions/permission-broker';
import { handleAsync, parsePayload } from './ipc-helpers';

/**
 * The Site Info bubble's data (`page-info:get`) — Chrome's Page Info panel, assembled on demand.
 *
 * On demand and not on `tabs:state` because every field here is expensive or async: a cookie probe
 * across every browsing partition, a PEM-shaped certificate, the full per-origin permission map. The
 * cheap verdict the omnibox glyph needs (`activeSecurityLevel`) already rides the state push; this is
 * only built when the user actually opens the bubble.
 *
 * Never throws for an odd URL. An unparseable string, an internal `tepegoz://` page or a `file://`
 * resource all resolve to the null-heavy shape — the bubble renders a short "local page" note for
 * those rather than an error.
 */

/** Sum this origin's cookies across every live browsing partition (Direct + tunnels + private). */
async function cookieCount(origin: string): Promise<number> {
  let total = 0;
  for (const { partition, session: ses } of BrowsingSessions.all()) {
    try {
      const cookies = await ses.cookies.get({ url: origin });
      total += cookies.length;
    } catch (err) {
      Logger.warn('Cookie probe failed while building page info', { partition, err: String(err) });
    }
  }
  return total;
}

/**
 * The permission rows the bubble should SHOW for `origin` — the ones this site actually asked for
 * this run, plus every one the user has already decided (an explicit "Ask" included, so a row does
 * not vanish under the cursor when it is set back).
 *
 * Not the full brokered set: a site that never wanted the camera has no business owning a camera row,
 * and six always-present dropdowns are the noise that made the panel unreadable. Everything not
 * listed here is still reachable from Site settings.
 */
function permissionsFor(origin: string): PageSitePermission[] {
  const stored = PreferenceStore.getAll().sitePermissions[origin] ?? {};
  const asked = new Set(requestedCapabilities(origin));
  return WEB_PERMISSION_CAPABILITIES.filter(
    (capability) => stored[capability] !== undefined || asked.has(capability),
  ).map((capability) => ({ capability, state: stored[capability] ?? 'prompt' }));
}

/** The user's standing trust level for `host` (exact eTLD+1 or a parent domain), else null. */
function trustLevelFor(host: string): PageInfo['trustLevel'] {
  const match = listTrustProfiles().find(
    (p) => !p.tombstone && (host === p.domain || host.endsWith(`.${p.domain}`)),
  );
  return match?.level ?? null;
}

/** Split from the handler so the assembly is testable without an `ipcMain`. */
export async function buildPageInfo(rawUrl: string, isPrivateWindow: boolean): Promise<PageInfo> {
  let parsed: URL | null = null;
  try {
    parsed = new URL(rawUrl);
  } catch {
    /* keep null — an unparseable URL still gets a well-formed, empty PageInfo */
  }

  const scheme = parsed?.protocol ?? '';
  const isWeb = scheme === 'http:' || scheme === 'https:';
  // Only a real network origin gets a host in the payload — an internal `tepegoz://settings` page
  // parses to `hostname: "settings"`, which is not something the bubble header should show.
  const host = isWeb && parsed !== null ? parsed.hostname : '';
  const origin = isWeb && parsed !== null ? parsed.origin : '';

  const recorded = host !== '' ? getRecordedCert(host) : undefined;
  const recordedError =
    recorded !== undefined && recorded.errorCode !== 0 ? recorded.verificationResult : null;
  const proceededPastCertError = origin !== '' && hasCertificateException(origin);
  const certErrorCode = proceededPastCertError
    ? (recordedError ?? 'net::ERR_CERT_INVALID')
    : recordedError;

  const level = classifyPageSecurity(rawUrl, { certErrorCode, proceededPastCertError });

  return {
    url: rawUrl.slice(0, 4096),
    origin,
    host,
    scheme,
    level,
    isPrivateWindow,
    certificate: recorded !== undefined ? toCertificateSummary(recorded) : null,
    certErrorCode,
    cookieCount: isWeb ? await cookieCount(origin) : 0,
    permissions: isWeb ? permissionsFor(origin) : [],
    trustLevel: isWeb ? trustLevelFor(host) : null,
  };
}

export function registerPageInfoIpc(): void {
  handleAsync(IpcChannels.pageInfoGet, async (event, payload): Promise<PageInfo> => {
    const { url } = parsePayload(PageInfoGetSchema, payload);
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    const isPrivateWindow = TabManager.forSenderWindow(senderWindow)?.isPrivate ?? false;
    return buildPageInfo(url, isPrivateWindow);
  });
}
