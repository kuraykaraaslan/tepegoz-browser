import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { AppError, Logger, toBoundary } from '@tepegoz/libs';
import { encodeBoundaryMessage, IpcChannels } from '@tepegoz/desktop-ipc';
import { LoginFillSchema } from '@tepegoz/desktop-ipc/schemas';
import { PasswordProviderRegistry } from '@tepegoz/password-core';
import type { PasswordVault } from '@tepegoz/password-vault';
import TabManager from '../tabs';
import { isTrustedAppUrl } from '../lib/trusted-origin';
import { mainStrings } from '../lib/i18n-main';

/** Fill script executed inside the page's renderer context via executeJavaScript. Credentials are
 *  JSON-stringified in main (XSS-safe) and never returned to the renderer. */
function buildFillScript(username: string, plainPassword: string): string {
  const u = JSON.stringify(username);
  const p = JSON.stringify(plainPassword);
  return `(function(u,p){
    var pw=document.querySelector('input[type="password"]');
    if(!pw)return false;
    var form=pw.form||pw.closest('form')||document;
    var user=form.querySelector('input[type="email"],input[type="text"][name*="user"],input[type="text"][name*="email"],input[type="text"][id*="user"],input[type="text"][id*="email"],input[type="text"]');
    function set(el,v){var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
    if(user)set(user,u);
    set(pw,p);
    return true;
  })(${u},${p})`;
}

export default class AutofillHost {
  private static win: BrowserWindow | null = null;
  private static vault: PasswordVault | null = null;
  private static unsubscribeNavigation: (() => void) | null = null;

  static attach(win: BrowserWindow, vault: PasswordVault): void {
    AutofillHost.win = win;
    AutofillHost.vault = vault;

    AutofillHost.unsubscribeNavigation = TabManager.onNavigation(
      (url: string) => { void AutofillHost.onPageLoaded(url); },
    );

    ipcMain.handle(IpcChannels.loginsFill, async (event: IpcMainInvokeEvent, payload: unknown) => {
      try {
        const senderUrl = event.senderFrame?.url ?? '';
        if (!isTrustedAppUrl(senderUrl)) {
          Logger.warn('Rejected autofill from untrusted sender', { url: senderUrl });
          throw new AppError(mainStrings().errors.forbidden, 403);
        }
        const { credentialId } = LoginFillSchema.parse(payload);
        await AutofillHost.fill(credentialId);
      } catch (err) {
        const boundary = toBoundary(err);
        Logger.error(`IPC ${IpcChannels.loginsFill} failed`, { statusCode: boundary.statusCode, message: boundary.message });
        throw new Error(encodeBoundaryMessage(boundary.message, boundary.statusCode));
      }
    });
  }

  static detach(): void {
    AutofillHost.unsubscribeNavigation?.();
    AutofillHost.unsubscribeNavigation = null;
    ipcMain.removeHandler(IpcChannels.loginsFill);
    AutofillHost.win = null;
    AutofillHost.vault = null;
  }

  private static async onPageLoaded(url: string): Promise<void> {
    const win = AutofillHost.win;
    if (!win || win.isDestroyed()) return;
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

  private static async fill(credentialId: string): Promise<void> {
    const vault = AutofillHost.vault;
    if (!vault) throw new AppError('Password vault not initialized', 500);

    const credential = await vault.findById(credentialId);
    if (!credential) throw new AppError('Credential not found', 404);

    const plain = vault.decrypt(credential);

    const wc = TabManager.activeWebContents();
    if (!wc || wc.isDestroyed()) throw new AppError('No active tab', 404);

    await wc.executeJavaScript(buildFillScript(credential.username, plain), true);
  }
}
