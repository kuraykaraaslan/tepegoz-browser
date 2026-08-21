import { isSensitiveSite } from './sensitive-site';

/**
 * May DevTools be opened on this page? (Phase 2b)
 *
 * DevTools is a **user** tool, and this is not an attempt to protect the user from themselves. It is
 * about what a DevTools window on a banking page *is*: a live, scriptable console attached to an
 * authenticated session, sitting in the same product as an agent that drives the UI. The agent has no
 * `devtools_*` capability and never will — but "the agent cannot open it" and "nothing that reaches the
 * chrome can open it on a bank" are different guarantees, and only the second survives a compromised
 * renderer or a mis-wired context menu.
 *
 * So the gate is the same sensitive-site list the policy kernel already locks automation out of. One
 * list, one meaning: the sites where a session is worth the most are the sites where the most powerful
 * surface stays shut.
 *
 * The refusal is **explained, not silent**. A DevTools shortcut that quietly does nothing reads as a
 * bug, and a user who thinks the browser is broken will go looking for a browser that is not.
 */

export type DevToolsVerdict =
  { allowed: true } | { allowed: false; reason: 'sensitive_site' | 'no_page' };

export function mayOpenDevTools(url: string | null | undefined): DevToolsVerdict {
  if (url === null || url === undefined || url.trim().length === 0) {
    return { allowed: false, reason: 'no_page' };
  }
  if (isSensitiveSite(url)) return { allowed: false, reason: 'sensitive_site' };
  return { allowed: true };
}
