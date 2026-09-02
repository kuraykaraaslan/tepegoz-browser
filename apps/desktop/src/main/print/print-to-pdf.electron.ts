import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, dialog } from 'electron';
import { Logger } from '@tepegoz/libs';
import NotificationHost from '../notifications/notification-host';
import { mainStrings } from '../lib/i18n-main';
import TabManager from '../tabs';
import { pdfFileName } from './pdf-filename';

/**
 * "Save as PDF" — `webContents.printToPDF` written to a file the user picks.
 *
 * Separate from `page-commands.ts` on purpose. That module is imported BY the tab model (it holds the
 * bodies of the right-click commands, so the keyboard and the menu run the same code), which means it
 * may not reach back into `NotificationHost` — that imports `TabManager`, and the cycle is real, not
 * stylistic. This module is imported only by the context-menu dispatcher, which sits outside the tab
 * graph, so it is free to tell the user what happened.
 *
 * Why this exists at all when Ctrl+P already offers a PDF destination in the system dialog: the system
 * dialog's PDF printer is a printer. This is the direct command, it names the file, and it reports a
 * failure — `printToPDF` rejects on a page that cannot be rendered, and a save that silently did
 * nothing is the failure mode this repo keeps finding.
 *
 * The order matters. The path is asked for BEFORE the PDF is generated: rendering a long page and then
 * discarding it because the user hit Cancel is work done for nothing, and on a slow page the dialog
 * would appear long after the click.
 *
 * NOT gated on the sensitive-site list, deliberately. That lockout exists to stop AUTOMATION acting on
 * a bank, and this is the USER's own command on their own screen — printing your own statement is not
 * automation, and blocking it would teach nothing except that the browser is broken.
 *
 * The agent has its own path as of 2026-09-02 (`browser_export_pdf` → `ingestGeneratedFile`), and it is
 * gated: `state_changing`, so the ToolGateway asks a human, and the file lands in quarantine under
 * `actor: 'agent'`, which `releaseNeedsApproval` refuses to release without one. That is what makes
 * this function's "user action" distinction load-bearing rather than an assumption about who calls it.
 */
export async function savePageAsPdf(): Promise<void> {
  const tabs = TabManager.focused();
  const win = TabManager.focusedWindow();
  const wc = tabs?.activeWebContents() ?? null;
  if (wc === null || wc.isDestroyed()) return;

  const t = mainStrings().browser;
  // The title is whatever the PAGE set, so it goes through `pdfFileName` before it can reach a path.
  const suggested = pdfFileName(wc.getTitle(), t.pdfDefaultName);
  const defaultPath = join(app.getPath('downloads'), suggested);

  const picked =
    win === null
      ? await dialog.showSaveDialog({ defaultPath })
      : await dialog.showSaveDialog(win, { defaultPath });
  if (picked.canceled || picked.filePath === undefined || picked.filePath.length === 0) return;

  try {
    const pdf = await wc.printToPDF({});
    await writeFile(picked.filePath, pdf);
    NotificationHost.push({
      // `download`, not a browser-chrome source: the user asked for a file and got one, so it belongs
      // in the same place they look for anything they saved.
      source: 'download',
      kind: 'info',
      title: t.pdfSavedTitle,
      body: suggested,
      channels: ['center', 'toast'],
    });
  } catch (err: unknown) {
    // The path the user picked can be unwritable, the disk full, or the page un-renderable. Any of
    // those must SAY so: the user asked for a file and would otherwise go looking for one that is not
    // there. The error text stays in the log; the notification names the act, not the errno.
    Logger.warn('Save as PDF failed', { err: String(err) });
    NotificationHost.push({
      source: 'download',
      kind: 'error',
      title: t.pdfFailedTitle,
      body: t.pdfFailedBody,
      channels: ['center', 'toast'],
    });
  }
}
