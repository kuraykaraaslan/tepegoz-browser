import {
  SITE_DATA_KINDS,
  type SiteClearPlan,
  type SiteClearWarning,
} from '@tepegoz/shared-types';
import { registrableDomain } from './registrable-domain';

/**
 * "Forget this site" — what a per-site clear actually covers (Phase 2).
 *
 * The pure half of the feature: deciding the scope. The Electron calls live in main; the decision about
 * *which origins* a request covers, and *what it will destroy that the user may not expect*, is here so
 * it can be tested and so both the confirmation dialog and the journal entry read from one source.
 *
 * The property this exists to protect: **a per-site clear must never be able to log the user out of
 * everything**. Clearing by registrable domain covers `mail.example.com` and `www.example.com` together,
 * which is what a person means by "this site" — but it must not walk up to a public suffix and take the
 * rest of the internet with it.
 */

export interface SiteClearContext {
  /** Does the user have a session on this site right now? */
  hasActiveSession?: boolean;
  /** Does the password vault hold an entry for this site? */
  hasSavedCredentials?: boolean;
  /** Does the site have a service worker / offline cache that will stop working? */
  hasOfflineData?: boolean;
}

/**
 * Build the clear plan for a URL, or null when the URL has no site to scope to.
 *
 * Null rather than a best guess: an unparseable URL, an IP literal, or a bare public suffix has no
 * "site" in the sense this feature means, and clearing *something nearby* would be worse than refusing.
 */
export function planSiteClear(url: string, ctx: SiteClearContext = {}): SiteClearPlan | null {
  const site = registrableDomain(url);
  if (site === null || site.length === 0) return null;

  const warnings: SiteClearWarning[] = [];
  if (ctx.hasActiveSession === true) warnings.push('signs_you_out');
  if (ctx.hasSavedCredentials === true) warnings.push('holds_saved_credentials');
  if (ctx.hasOfflineData === true) warnings.push('has_offline_data');

  return {
    site,
    // Both schemes and both host forms: a site that redirected http→https years ago still has cookies
    // under the old origin, and leaving them behind makes "forget" a word that is not quite true.
    origins: [`https://${site}`, `http://${site}`, `https://www.${site}`, `http://${site}`]
      .filter((o, i, all) => all.indexOf(o) === i),
    kinds: [...SITE_DATA_KINDS],
    warnings,
  };
}

/**
 * The vault is NEVER in scope.
 *
 * Stated as its own predicate because it is the invariant most likely to be broken by someone adding "and
 * also clear saved passwords" to a "forget this site" button. Saved credentials are user-authored data
 * that survives a site being forgotten; the warning tells the user the vault still holds them, which is a
 * different act from deleting them.
 */
export function clearsCredentialVault(): boolean {
  return false;
}
