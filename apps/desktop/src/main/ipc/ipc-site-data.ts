import { session } from 'electron';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Logger } from '@tepegoz/libs';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { isSameSite, planSiteClear } from '@tepegoz/security-policy';
import type { SiteClearPlan } from '@tepegoz/shared-types';
import { EventJournal } from '@tepegoz/persistence';
import { passwordVault } from '@tepegoz/password-vault';
import { APP_PARTITION } from '../window';
import BrowsingSessions from '../network/browsing-sessions.electron';
import { getDb } from '../db/database.electron';
import { handleAsync } from './ipc-helpers';

/**
 * "Forget this site" (Phase 2) — clear one site's cookies, storage, caches and service workers in a
 * single action.
 *
 * Three properties this module holds:
 *
 * 1. **The user is warned BEFORE confirming.** `siteDataPlan` reports what the clear would cover and what
 *    it would break — signing you out, breaking offline use, and whether the vault still has a password
 *    for the site. Discovering afterwards that a button signed you out is the kind of "helpful" that
 *    erodes trust in every other button.
 * 2. **The credential vault is never in scope.** Saved passwords are user-authored data that outlives a
 *    site being forgotten. The plan *mentions* them because that is useful to know; deleting them is a
 *    different act, and it has to be asked for separately.
 * 3. **Only BROWSING partitions are touched.** The app's own chrome partition holds the browser's UI
 *    state, not the site's data, and a "forget this site" that reached into it would be clearing
 *    something the user never asked about.
 * 4. **EVERY browsing partition, not just the Direct one.** Since Phase 5 a tab bound to a VPN/Tor
 *    connection stores its cookies in that connection's own partition. A clear that stopped at the base
 *    partition would report success and leave the site logged in behind the tunnel — the one copy of
 *    that data the user is least likely to think to look for.
 *
 * The clear is recorded in the Event Journal (`SiteDataCleared`, ADR-0004 "shown = recorded"): a
 * destructive action nobody can find afterwards is one nobody can reason about.
 */

const SiteUrlSchema = z.string().min(1).max(4096);

/**
 * Does the vault hold a login for this site?
 *
 * Compared on eTLD+1 like everything else here, so a password saved for `accounts.example.com` is
 * reported when the user forgets `example.com`. Any failure reads as "no" — a warning we cannot stand
 * behind is worse than none, because a warning that is sometimes wrong teaches people to click through
 * every warning.
 */
async function hasSavedCredentials(url: string): Promise<boolean> {
  try {
    const entries = await passwordVault.list();
    return entries.some((e) => isSameSite(e.url, url));
  } catch {
    return false;
  }
}

/** Does this site have cookies right now? A cookie is the cheapest honest proxy for "a session to lose". */
async function hasActiveSession(origins: readonly string[]): Promise<boolean> {
  for (const { partition, session: ses } of BrowsingSessions.all()) {
    try {
      for (const origin of origins) {
        const cookies = await ses.cookies.get({ url: origin });
        if (cookies.length > 0) return true;
      }
    } catch (err) {
      Logger.warn('Cookie probe failed while planning a site clear', { partition, err: String(err) });
    }
  }
  return false;
}

async function buildPlan(url: string): Promise<SiteClearPlan | null> {
  const shape = planSiteClear(url);
  if (shape === null) return null;
  return planSiteClear(url, {
    hasActiveSession: await hasActiveSession(shape.origins),
    hasSavedCredentials: await hasSavedCredentials(url),
    // Offline data is deliberately NOT probed: knowing it would mean querying every storage backend per
    // origin, and a warning we are unsure of is one that trains people to ignore warnings.
  });
}

export function registerSiteDataIpc(): void {
  handleAsync(IpcChannels.siteDataPlan, async (_event, payload): Promise<SiteClearPlan | null> =>
    buildPlan(SiteUrlSchema.parse(payload)),
  );

  handleAsync(IpcChannels.siteDataClear, async (_event, payload): Promise<SiteClearPlan | null> => {
    const plan = await buildPlan(SiteUrlSchema.parse(payload));
    if (plan === null) return null;

    // Browsing partitions only, and ALL of them. APP_PARTITION is the browser's own chrome; a site clear
    // that reached into it would be clearing something the user never asked about.
    const appSession = session.fromPartition(APP_PARTITION);
    const targets = BrowsingSessions.all().filter((s) => s.session !== appSession);
    if (targets.length !== BrowsingSessions.all().length) {
      Logger.warn('Refusing a site clear on a partition shared with the app chrome');
    }
    for (const { partition, session: ses } of targets) {
      for (const origin of plan.origins) {
        try {
          await ses.clearStorageData({ origin, storages: [...plan.kinds] });
        } catch (err) {
          // One failing origin (or partition) must not abandon the others — a partial clear is bad, a
          // silently abandoned one is worse.
          Logger.warn('Site data clear failed for an origin', { partition, origin, err: String(err) });
        }
      }
    }

    const db = getDb();
    if (db !== null) {
      try {
        EventJournal.append(db, {
          id: randomUUID(),
          type: 'SiteDataCleared',
          ts: Date.now(),
          actor: 'user',
          // One clear, one correlation id: the journal's unit of work here is the action itself.
          correlationId: `site-clear-${plan.site}`,
          payload: { site: plan.site, kinds: plan.kinds.length, warnings: plan.warnings },
          redacted: false,
        });
      } catch (err) {
        Logger.warn('Site data clear journal append failed', { err: String(err) });
      }
    }
    Logger.info('Cleared site data', { site: plan.site, partitions: targets.length });
    return plan;
  });
}
