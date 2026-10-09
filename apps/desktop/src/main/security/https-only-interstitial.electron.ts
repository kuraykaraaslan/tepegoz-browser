import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';
import { mainLocale, mainStrings } from '../lib/i18n-main';
import BrowsingSessions from '../network/browsing-sessions.electron';
import { normalizeHost, type TunnelKind } from '../network/https-only';
import {
  addHttpsOnlyBypass,
  tunnelKindOfPartition,
  tunnelLabel,
} from '../network/https-only.electron';
import { journalHttpsOnlyBypass } from './https-only-journal';

/**
 * The fallback page for HTTPS-only on a tunnel-bound tab (ADR-0050): shown when the upgraded https
 * navigation could not load, so the user is never left with only a raw Chromium error and is never
 * silently downgraded to cleartext.
 *
 * "Continue over HTTP" is a link to the original URL carrying a single-use nonce in its fragment. The
 * nonce lives in a per-tab record bound to the host, so a page that links to `http://bank#...` cannot
 * downgrade anything: without a live matching nonce the navigation is an ordinary one and the upgrade
 * applies as usual. A fragment never reaches the server.
 */

export const BYPASS_FRAGMENT_KEY = '#__tepegoz_https_only_bypass__=';

export type InterstitialKind = 'bypass' | 'tunnel-down' | 'non-get';

interface NonceRecord {
  nonce: string;
  host: string;
}

const nonces = new WeakMap<WebContents, NonceRecord>();

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function fill(template: string, host: string, tunnel: string): string {
  // One pass with a function replacer: a host such as `a$&b.com` must not be read as a replacement
  // pattern, nor a substituted value re-scanned for the other placeholder.
  return template.replace(/\{(host|tunnel)\}/g, (_m, key: string) =>
    key === 'host' ? host : tunnel,
  );
}

export interface InterstitialInput {
  kind: InterstitialKind;
  host: string;
  /** The original http URL, shown as text. */
  url: string;
  tunnel: string;
  /** HTTPS-first on an ordinary tab: no tunnel to name, so the body that mentions one is not used. */
  direct?: boolean;
  /** Only for kind `bypass`. */
  proceedHref?: string;
}

export function httpsOnlyInterstitialHtml(input: InterstitialInput): string {
  const t = mainStrings().httpsOnly;
  const locale = mainLocale();
  const title = input.kind === 'tunnel-down' ? t.tunnelDownTitle : t.title;
  const body =
    input.kind === 'tunnel-down'
      ? t.tunnelDownBody
      : input.kind === 'non-get'
        ? t.nonGetBody
        : input.direct === true
          ? t.bodyDirect
          : t.body;
  const warning = input.kind === 'bypass' ? `<p>${escapeHtml(t.interferenceWarning)}</p>` : '';
  const proceed =
    input.kind === 'bypass' && input.proceedHref !== undefined
      ? `<a class="btn go" href="${escapeHtml(input.proceedHref)}">${escapeHtml(t.proceed)}</a>`
      : '';
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light dark}
body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#7a4b00;color:#fff;
display:flex;min-height:100vh;align-items:center;justify-content:center}
main{max-width:34rem;padding:2rem}
h1{font-size:1.6rem;margin:0 0 1rem}
code{background:rgba(0,0,0,.25);padding:.15em .4em;border-radius:.25em;word-break:break-all}
.row{margin-top:1.75rem;display:flex;gap:.75rem;flex-wrap:wrap}
a.btn{display:inline-block;padding:.6rem 1.1rem;border-radius:.4rem;text-decoration:none;font-weight:600}
a.back{background:#fff;color:#7a4b00}
a.go{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.6);font-weight:400;font-size:.9rem}
</style></head><body><main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(fill(body, input.host, input.tunnel))}</p>
${warning}
<p><code>${escapeHtml(input.url)}</code></p>
<div class="row">
<a class="btn back" href="javascript:history.length>1?history.back():window.close()">${escapeHtml(t.back)}</a>
${proceed}
</div>
</main></body></html>`;
}

function stripHash(url: string): string {
  const at = url.indexOf('#');
  return at === -1 ? url : url.slice(0, at);
}

/** Load the interstitial into `wc`. A `bypass` page arms a fresh single-use nonce for that tab. */
export function showHttpsOnlyInterstitial(
  wc: WebContents,
  kind: InterstitialKind,
  host: string,
  httpUrl: string,
  tunnelKind: TunnelKind,
): void {
  if (wc.isDestroyed()) return;
  const cleanUrl = stripHash(httpUrl);
  let proceedHref: string | undefined;
  if (kind === 'bypass') {
    const nonce = randomUUID();
    nonces.set(wc, { nonce, host: normalizeHost(host) });
    proceedHref = `${cleanUrl}${BYPASS_FRAGMENT_KEY}${nonce}`;
  } else {
    nonces.delete(wc);
  }
  const html = httpsOnlyInterstitialHtml({
    kind,
    host,
    url: cleanUrl,
    tunnel: tunnelLabel(tunnelKind),
    ...(tunnelKind === 'direct' ? { direct: true } : {}),
    ...(proceedHref !== undefined ? { proceedHref } : {}),
  });
  wc.stop();
  void wc
    .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    .catch(() => undefined);
}

export type HttpsOnlyNavOutcome = 'proceed' | 'ignore';

/**
 * Call first from `will-navigate`. `'proceed'` means a valid bypass sentinel was consumed and the clean
 * URL is being loaded here; the caller MUST `preventDefault()`. Anything else (no sentinel, a wrong,
 * reused or other-tab nonce) is `'ignore'`: an ordinary navigation, still subject to the upgrade.
 */
export function handleHttpsOnlyNavigation(wc: WebContents, url: string): HttpsOnlyNavOutcome {
  const at = url.indexOf(BYPASS_FRAGMENT_KEY);
  if (at === -1 || wc.isDestroyed()) return 'ignore';
  const record = nonces.get(wc);
  if (record === undefined) return 'ignore';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'ignore';
  }
  const presented = url.slice(at + BYPASS_FRAGMENT_KEY.length);
  if (
    parsed.protocol !== 'http:' ||
    presented !== record.nonce ||
    normalizeHost(parsed.hostname) !== record.host
  ) {
    return 'ignore';
  }
  const partition = BrowsingSessions.partitionOf(wc.session);
  if (partition === null) return 'ignore';
  nonces.delete(wc);
  addHttpsOnlyBypass(partition, record.host);
  journalHttpsOnlyBypass(record.host, tunnelKindOfPartition(partition));
  void wc.loadURL(stripHash(url)).catch(() => undefined);
  return 'proceed';
}
