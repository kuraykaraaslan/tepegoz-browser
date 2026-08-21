/**
 * Canonical origin key for credential matching. ONE definition: `registry.ts` and `password-vault`
 * each carried a private copy, and a credential is only ever as safe as the weakest of the copies that
 * decides "does this secret belong to this page". Autofill's target check uses this same function, so
 * "stored under origin X" and "the page is origin X" cannot drift apart.
 *
 * A URL that does not parse yields the raw string, which can never equal a real `URL.origin` — an
 * unparseable page URL therefore matches nothing rather than matching everything.
 */
export function normalizeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
