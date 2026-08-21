import { BrowserWindow, type WebContents } from 'electron';
import { AppError, Logger } from '@tepegoz/libs';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { LoginFillSchema } from '@tepegoz/desktop-ipc/schemas';
import { normalizeOrigin, PasswordProviderRegistry } from '@tepegoz/password-core';
import type { PasswordVault } from '@tepegoz/password-vault';
import TabManager from '../tabs';
import { handleAsync, parsePayload, removeHandler } from '../ipc/ipc-helpers';
import { mainStrings } from '../lib/i18n-main';

/**
 * Autofill: inject a stored credential into the page the user is looking at.
 *
 * THE INVARIANT: a secret is only ever released to the origin it was stored under. The renderer names
 * a credential id, but the id alone decides nothing — the target set is re-derived from the tab's LIVE
 * url on every fill, and a request for an id outside that set is a 403. Two things follow, and both are
 * the point:
 *
 *  - A compromised renderer cannot dump the vault. `logins:list` hands it every credential id, so
 *    before this check it could point a tab at a page it controlled, replay each id, and read the
 *    plaintext back out of the DOM. Now every id it did not earn by actually being on that origin is
 *    refused.
 *  - A navigation between "we offered autofill" and "the user clicked" cannot redirect the secret. The
 *    main-side check re-reads the url at fill time, and the injected script re-asserts `location.origin`
 *    from INSIDE the document, so the comparison is atomic with the write instead of racing it.
 */

/** Origin-locked fill. Runs in the page; bails unless the document is still the origin we authorized. */
function buildFillScript(username: string, plainPassword: string, expectedOrigin: string): string {
  const u = JSON.stringify(username);
  const p = JSON.stringify(plainPassword);
  const o = JSON.stringify(expectedOrigin);
  return `(function(u,p,expected){
    // Re-check INSIDE the document: between main's check and this call the frame may have navigated.
    if(location.origin!==expected)return 'origin-changed';
    var pw=document.querySelector('input[type="password"]');
    if(!pw)return 'no-password-field';
    var form=pw.form||pw.closest('form');
    var scope=form||document;
    // Username is best-effort and DELIBERATELY narrow: an explicit identity field, or nothing. The old
    // last-resort 'input[type="text"]' typed the username into whatever text box came first in the
    // document — a search box, a comment field — on any page whose login form did not match.
    var user=scope.querySelector('input[type="email"],input[autocomplete="username"],input[type="text"][name*="user" i],input[type="text"][name*="email" i],input[type="text"][name*="login" i],input[type="text"][id*="user" i],input[type="text"][id*="email" i]');
    function set(el,v){
      var d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
      if(d&&d.set)d.set.call(el,v);else el.value=v;
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    }
    if(user)set(user,u);
    set(pw,p);
    return 'filled';
  })(${u},${p},${o})`;
}

export default class AutofillHost {
  private static vault: PasswordVault | null = null;
  private static unsubscribeNavigation: (() => void) | null = null;

  /** Registers the fill IPC handler once and subscribes to navigations across all windows; the
   *  autofill-available push targets the window that hosts the navigating tab. */
  static attach(vault: PasswordVault): void {
    AutofillHost.vault = vault;

    AutofillHost.unsubscribeNavigation = TabManager.onNavigation(
      (url: string, _wc: WebContents, owner: BrowserWindow) => {
        void AutofillHost.onPageLoaded(url, owner);
      },
    );

    // Shared boundary (sender allow-list + AppError mapping + safeParse) — this file used to inline a
    // third private copy of it.
    handleAsync(IpcChannels.loginsFill, async (event, payload): Promise<void> => {
      const { credentialId, tabId } = parsePayload(LoginFillSchema, payload);
      const wc = AutofillHost.targetTab(event.sender, tabId);
      await AutofillHost.fill(credentialId, wc);
    });
  }

  static detach(): void {
    AutofillHost.unsubscribeNavigation?.();
    AutofillHost.unsubscribeNavigation = null;
    removeHandler(IpcChannels.loginsFill);
    AutofillHost.vault = null;
  }

  /**
   * The tab to fill, resolved from the SENDER's window — not from global focus. `activeWebContents()`
   * asked whichever window happened to be focused, so a fill triggered in window A could land in
   * window B. `tabId` (already in the schema, previously ignored) pins it exactly when the caller knows.
   */
  private static targetTab(sender: WebContents, tabId: string | undefined): WebContents {
    const tabs = TabManager.forSenderWindow(BrowserWindow.fromWebContents(sender));
    const wc =
      tabId === undefined
        ? (tabs?.activeWebContents() ?? null)
        : (tabs?.webContentsForTab(tabId) ?? null);
    if (wc === null || wc.isDestroyed()) throw new AppError(mainStrings().errors.notFound, 404);
    return wc;
  }

  private static async onPageLoaded(url: string, win: BrowserWindow): Promise<void> {
    if (win.isDestroyed()) return;
    try {
      const matches = await PasswordProviderRegistry.findByUrl(url);
      if (matches.length === 0) return;
      // Explicit metadata projection — the encrypted password never crosses IPC to the renderer.
      const metas = matches.map((c) => ({
        id: c.id,
        url: c.url,
        username: c.username,
        title: c.title,
        notes: c.notes,
        providerId: c.providerId,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
      win.webContents.send(IpcChannels.loginsAutofillAvailable, { url, matches: metas });
    } catch (err) {
      Logger.warn('Autofill lookup failed', { url, err: String(err) });
    }
  }

  private static async fill(credentialId: string, wc: WebContents): Promise<void> {
    const vault = AutofillHost.vault;
    if (!vault) throw new AppError(mainStrings().errors.upstreamDown, 503);

    const pageUrl = wc.getURL();
    const pageOrigin = normalizeOrigin(pageUrl);

    // Authorization is derived from the PAGE, never from the id the renderer sent. A credential the
    // live origin does not own is indistinguishable here from one that does not exist: same 403, so
    // the response cannot be used to probe which ids are real.
    const allowed = await PasswordProviderRegistry.findByUrl(pageUrl);
    const credential = allowed.find((c) => c.id === credentialId);
    if (!credential) {
      Logger.warn('Rejected autofill: credential does not belong to the active origin', {
        origin: pageOrigin,
      });
      throw new AppError(mainStrings().errors.forbidden, 403);
    }

    const plain = vault.decrypt(credential);

    if (wc.isDestroyed() || normalizeOrigin(wc.getURL()) !== pageOrigin) {
      throw new AppError(mainStrings().errors.forbidden, 403);
    }

    // `executeJavaScript` is typed `Promise<any>`; the page decides what comes back, so it is unknown
    // until compared.
    const outcome: unknown = await wc.executeJavaScript(
      buildFillScript(credential.username, plain, pageOrigin),
      true,
    );
    if (outcome !== 'filled') {
      Logger.warn('Autofill did not complete', { origin: pageOrigin, outcome: String(outcome) });
      throw new AppError(mainStrings().errors.badState, 409);
    }
  }
}
