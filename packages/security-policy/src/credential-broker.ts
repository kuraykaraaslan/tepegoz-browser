import { isSameSite, registrableDomain } from './registrable-domain';

/**
 * The credential broker's decision layer (S6 PR6) — pure, so the rules that stand between a stored
 * password and a hostile page are unit-testable without Electron, a vault, or a browser.
 *
 * Three refusals, in order, each closing a different attack:
 *
 * 1. **No OS-auth gate installed ⇒ refuse.** A broker that fills without the user present is a
 *    credential-stuffing tool with a friendly name. "Nobody could check" is not "the user agreed".
 * 2. **No stored credential for this site ⇒ refuse.** Silence, not a guess: filling the nearest match
 *    is how a look-alike domain harvests a real password.
 * 3. **Site match is eTLD+1, not substring.** `bank.test.evil.com` contains `bank.test`; a substring
 *    check would hand it the password. The registrable-domain resolver is already the thing S6 PR3 used
 *    for grant scoping, and it is the same question here.
 *
 * The origin is never taken from the agent — the caller reads it from the live tab. An agent-supplied
 * origin is precisely how a poisoned page would aim a credential at a site of its choosing.
 */

/** Verifies the human is present and consents. Installed by the app (OS auth / Windows Hello). */
export type OsAuthGate = (reason: string) => Promise<boolean>;

let gate: OsAuthGate | null = null;

/** Install (or clear, with `null`) the OS-auth gate the broker requires before any fill. */
export function setOsAuthGate(next: OsAuthGate | null): void {
  gate = next;
}

export function hasOsAuthGate(): boolean {
  return gate !== null;
}

/**
 * Run the OS-auth gate. **Absent ⇒ false**, and a throwing gate ⇒ false: a check that could not run did
 * not pass. There is no configuration in which a fill proceeds unauthenticated.
 */
export async function requireOsAuth(reason: string): Promise<boolean> {
  if (gate === null) return false;
  try {
    return await gate(reason);
  } catch {
    return false;
  }
}

export interface StoredCredentialRef {
  /** The vault entry's id — an opaque handle; the secret itself never appears in this layer. */
  id: string;
  /** The origin the entry was saved for. */
  origin: string;
}

export type CredentialMatch =
  | { ok: true; credentialId: string }
  | { ok: false; reason: string };

/**
 * Choose the stored credential for a page origin, or refuse with a reason the agent can act on.
 *
 * Ambiguity is a refusal, not a coin flip: two saved logins for one site is a question for the user, and
 * picking one would silently send the wrong identity to a real login form.
 */
export function matchCredential(pageOrigin: string, stored: readonly StoredCredentialRef[]): CredentialMatch {
  const site = registrableDomain(pageOrigin);
  if (site === null) {
    return { ok: false, reason: 'the current page has no resolvable site, so no credential can be matched to it' };
  }
  const candidates = stored.filter((entry) => isSameSite(entry.origin, pageOrigin));
  if (candidates.length === 0) {
    return { ok: false, reason: `no saved credential for ${site}` };
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      reason: `${String(candidates.length)} saved credentials for ${site} — ask the user which one to use`,
    };
  }
  return { ok: true, credentialId: candidates[0]?.id ?? '' };
}
