import type { SettingsStrings } from '@tepegoz/settings-ui';

/**
 * Every address the About page can send someone to, in one table.
 *
 * The page renders this by `map` and knows nothing about individual links, so adding one is a data
 * edit rather than a JSX edit — the same reason the extension catalog is a registry. It is a typed
 * module rather than a runtime-loaded file on purpose: these are the PRODUCT's own addresses, fixed at
 * build time, and a fetch would only add a failure mode to six constants that cannot vary per install.
 *
 * `labelKey` is checked against the settings dictionary, so a link whose label was never translated
 * fails `pnpm typecheck` instead of rendering `undefined` at the user.
 */

/** Keys of the settings dictionary whose value is a plain string (nested groups are not labels). */
type SettingsStringKey = {
  [K in keyof SettingsStrings]: SettingsStrings[K] extends string ? K : never;
}[keyof SettingsStrings];

export interface AboutLink {
  id: string;
  url: string;
  labelKey: SettingsStringKey;
}

/** The one place the repository address is written down; everything else hangs off it. */
const REPO = 'https://github.com/kuraykaraaslan/tepegoz-browser';

/** Named separately because the Updates note links to it directly, not through the project list. */
export const RELEASES_URL = `${REPO}/releases`;

/** The project itself — what a user needs to check, read, or file a bug against this build. */
export const PROJECT_LINKS: readonly AboutLink[] = [
  { id: 'source', url: REPO, labelKey: 'aboutSource' },
  { id: 'releases', url: RELEASES_URL, labelKey: 'aboutReleases' },
  { id: 'docs', url: `${REPO}#readme`, labelKey: 'aboutDocs' },
  { id: 'issues', url: `${REPO}/issues/new`, labelKey: 'aboutReportIssue' },
];

/** The person who writes it. Secondary to the product — rendered as credits, not as the headline. */
export const AUTHOR_LINKS: readonly AboutLink[] = [
  { id: 'website', url: 'https://kuray.dev', labelKey: 'aboutWebsite' },
  { id: 'github', url: 'https://github.com/kuraykaraaslan', labelKey: 'aboutGithub' },
  { id: 'linkedin', url: 'https://www.linkedin.com/in/kuraykaraaslan', labelKey: 'aboutLinkedin' },
  { id: 'instagram', url: 'https://www.instagram.com/kuraykaraaslan', labelKey: 'aboutInstagram' },
];

/** AGPL-3.0 requires the user to be able to reach the license and the source. Both live in the repo. */
export const LICENSE_URL = `${REPO}/blob/main/LICENSE`;

/**
 * Where "third-party notices" goes when the build ships no `LICENSES.chromium.html` — a dev run from a
 * source checkout, mainly. Chromium's own license file is the honest substitute; silently doing
 * nothing would not be.
 */
export const THIRD_PARTY_NOTICES_FALLBACK_URL =
  'https://chromium.googlesource.com/chromium/src/+/refs/heads/main/LICENSE';
