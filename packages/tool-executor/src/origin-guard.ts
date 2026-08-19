/**
 * Navigation-swap detection for the pre-dispatch gate (S4 PR2) — pure, so the rule that can REFUSE a
 * user-visible action is unit-testable without a browser.
 *
 * A ref is located on one page and acted on a moment later. If the page changed origin in between, the
 * gesture lands somewhere the agent never looked: a look-alike page can accept a transfer, print a
 * confirmation, and the agent will report success. Chromium will happily dispatch the click — nothing in
 * the DOM layer knows the page underneath was replaced.
 *
 * The gate is deliberately **narrow**. Refusing a legitimate action is its own failure, so anything that
 * is merely a *different page on the same site* passes:
 *
 * - `www.` is ignored on either side (`www.acme.test` and `acme.test` are one site to every user).
 * - An `http → https` **upgrade** passes; the reverse does not, because a downgrade is a real change in
 *   what the page is, not a cosmetic one.
 * - An unparseable or empty URL on either side is **not** a swap. The check must be able to prove a
 *   swap to refuse; internal pages and blank tabs must not become unclickable.
 */

/** `protocol//host:port`, or '' when the URL cannot be parsed. */
export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

interface Parts {
  protocol: string;
  host: string;
  port: string;
}

function partsOf(url: string): Parts | null {
  try {
    const parsed = new URL(url);
    return {
      protocol: parsed.protocol,
      host: parsed.hostname.replace(/^www\./i, '').toLowerCase(),
      port: parsed.port,
    };
  } catch {
    return null;
  }
}

/**
 * Did the page change to a different origin between locating a ref and acting on it?
 *
 * Returns false whenever a swap cannot be *proved* — an unknown URL is not evidence of a swap, and
 * treating it as one would refuse ordinary actions on pages this check simply cannot read.
 */
export function isOriginSwap(before: string, after: string): boolean {
  const a = partsOf(before);
  const b = partsOf(after);
  if (a === null || b === null) return false;
  if (a.host !== b.host) return true;
  if (a.port !== b.port) return true;
  if (a.protocol === b.protocol) return false;
  // Same host and port, different scheme: an upgrade to https is the ordinary redirect every site does;
  // a downgrade away from it is a genuine change in what the page is.
  return !(a.protocol === 'http:' && b.protocol === 'https:');
}

/** Message for the refusal, naming both origins so the model can re-read rather than guess. */
export function originSwapMessage(before: string, after: string): string {
  return (
    `The page changed origin after this element was located: it was ${originOf(before) || before} ` +
    `and is now ${originOf(after) || after}. The action was NOT performed — acting now would send it to ` +
    'a page you have not read. Read the current page again and decide from what is actually there.'
  );
}
