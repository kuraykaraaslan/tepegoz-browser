import type { WebContents } from 'electron';
import type { Locale } from '@tepegoz/i18n';
import { isWebUrl } from '../lib/navigation-url';
import { mainLocale } from '../lib/i18n-main';
import SafeBrowsingService from './safe-browsing-service.electron';
import { SafeBrowsingNavGuard } from './safe-browsing-nav-guard';

/**
 * The interstitial half of the navigation-time Safe Browsing check ([ADR-0043](../../../../../docs/adr/0043-safe-browsing-service-and-egress.md) §1):
 * on a confirmed `unsafe` verdict the tab is stopped and shown a full-page warning with a "go back"
 * default and an explicit "proceed anyway".
 *
 * "Proceed anyway" navigates the tab to the original URL with a sentinel fragment appended
 * ({@link PROCEED_FRAGMENT}). The `will-navigate` wiring recognises that fragment, records a one-shot
 * grant on the per-tab {@link SafeBrowsingNavGuard}, and re-loads the clean URL. A fragment (not a
 * query param) is used so nothing extra is ever sent to the server.
 *
 * Strings are inlined here rather than taken from a dictionary because the interstitial is a `data:`
 * document, not a React surface — moving them into `@tepegoz/i18n` core is owed.
 */

export const PROCEED_FRAGMENT = '#__tepegoz_safe_browsing_proceed__';

const STRINGS: Record<Locale, { title: string; body: string; back: string; proceed: string }> = {
  en: {
    title: 'Dangerous site blocked',
    body: 'Safe Browsing flagged this page as unsafe — it may try to install harmful software or steal your information.',
    back: 'Back to safety',
    proceed: 'Continue anyway (unsafe)',
  },
  tr: {
    title: 'Tehlikeli site engellendi',
    body: 'Güvenli Tarama bu sayfayı güvensiz olarak işaretledi — zararlı yazılım yüklemeye veya bilgilerinizi çalmaya çalışabilir.',
    back: 'Güvenli sayfaya dön',
    proceed: 'Yine de devam et (güvensiz)',
  },
};

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export function interstitialHtml(url: string, locale: Locale): string {
  const t = STRINGS[locale];
  const safeUrl = escapeHtml(url);
  const proceedHref = escapeHtml(url + PROCEED_FRAGMENT);
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(t.title)}</title>
<style>
:root{color-scheme:light dark}
body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#b71c1c;color:#fff;
display:flex;min-height:100vh;align-items:center;justify-content:center}
main{max-width:34rem;padding:2rem}
h1{font-size:1.6rem;margin:0 0 1rem}
code{background:rgba(0,0,0,.25);padding:.15em .4em;border-radius:.25em;word-break:break-all}
.row{margin-top:1.75rem;display:flex;gap:.75rem;flex-wrap:wrap}
a.btn{display:inline-block;padding:.6rem 1.1rem;border-radius:.4rem;text-decoration:none;font-weight:600}
a.back{background:#fff;color:#b71c1c}
a.go{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.6);font-weight:400;font-size:.9rem}
</style></head><body><main>
<h1>${escapeHtml(t.title)}</h1>
<p>${escapeHtml(t.body)}</p>
<p><code>${safeUrl}</code></p>
<div class="row">
<a class="btn back" href="javascript:history.length>1?history.back():window.close()">${escapeHtml(t.back)}</a>
<a class="btn go" href="${proceedHref}">${escapeHtml(t.proceed)}</a>
</div>
</main></body></html>`;
}

/** `null` unless `url` is a "proceed anyway" sentinel; otherwise the clean URL to re-load. */
export function parseProceedSentinel(url: string): string | null {
  if (!url.endsWith(PROCEED_FRAGMENT)) return null;
  return url.slice(0, -PROCEED_FRAGMENT.length);
}

const guards = new WeakMap<WebContents, SafeBrowsingNavGuard>();

function guardFor(wc: WebContents): SafeBrowsingNavGuard {
  let g = guards.get(wc);
  if (g === undefined) {
    g = new SafeBrowsingNavGuard({
      checkNavigation: (u) => SafeBrowsingService.checkNavigation(u),
      onBlock: (u) => {
        if (wc.isDestroyed()) return;
        wc.stop();
        void wc.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(interstitialHtml(u, mainLocale()))}`,
        );
      },
    });
    guards.set(wc, g);
  }
  return g;
}

export type SafeBrowsingNavOutcome = 'proceed' | 'checking' | 'ignore';

/**
 * Call from `will-navigate` / `will-redirect`. Returns:
 *  - `'proceed'` — this was a "proceed anyway" sentinel; the caller MUST `preventDefault()` (the clean
 *    URL is being re-loaded here);
 *  - `'checking'` — a background Safe Browsing check has been started; the caller lets navigation run;
 *  - `'ignore'` — not an http(s) URL, nothing to do.
 */
export function handleSafeBrowsingNavigation(wc: WebContents, url: string): SafeBrowsingNavOutcome {
  const clean = parseProceedSentinel(url);
  if (clean !== null) {
    guardFor(wc).allowOnce(clean);
    if (!wc.isDestroyed()) void wc.loadURL(clean);
    return 'proceed';
  }
  if (!isWebUrl(url)) return 'ignore';
  void guardFor(wc).onWillNavigate(url);
  return 'checking';
}
