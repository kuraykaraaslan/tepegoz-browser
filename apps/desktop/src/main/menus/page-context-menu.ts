import { randomUUID } from 'node:crypto';
import {
  type BrowserWindow,
  type ContextMenuParams,
  type Rectangle,
  type WebContents,
} from 'electron';
import type {
  PageMenuAction,
  PageMenuContext,
  PageMenuContributionActionInput,
} from '@tepegoz/desktop-ipc';
import PopupWindowManager from '../popup-window';
import TabManager from '../tabs';
import ClipboardService from '../clipboard/clipboard-service.electron';
import PageContextMenuContributionService from './page-context-menu-contributions';
import { savePageAsPdf } from '../print/print-to-pdf.electron';

/**
 * Web-page (WebContentsView) right-click menu — the Chrome-style page context menu. Unlike the native
 * tab menu (`tab-context-menu.ts`), this renders through the SAME primitive as the main menu: a
 * frameless popup window (`?surface=page-context-menu`) that draws the shared `@tepegoz/browser-menu`
 * over the live page. The trigger comes from the MAIN process (the view's `context-menu` event), so we
 * open the popup here directly and stash the click context; the popup surface then reads that context
 * (to pick its variant — selection/link/image/media/editable — and enable rows) and dispatches the
 * chosen action back, acted on against the active view here.
 */
const WIDTH = 260;
/** Open-time height estimate (px). The popup is `resizable:false`, so this MUST be >= the tallest
 *  variant's content height; the renderer measures and reports its natural height and main trims to fit. */
const HEIGHT = 680;
/** Cap the selection carried to the renderer (label display only — the full selection isn't needed). */
const SELECTION_DISPLAY_MAX = 120;

/** Everything captured at the last right-click: the renderer context + the Inspect/copy-image point. */
interface Captured extends PageMenuContext {
  x: number;
  y: number;
  parent: BrowserWindow;
  webContents: WebContents;
}

let last: Captured | null = null;
let openSeq = 0;

/** DuckDuckGo search URL for the selected text (matches the app's default engine / NEW_TAB_URL). */
function searchUrl(query: string): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
}

/** Open the page context menu at the click point. `viewBounds` is the web view's rect within the window
 *  content (so the view-relative `params.x/y` map to window-content coordinates for anchoring); `nav`
 *  is the clicked view's navigation state (captured now — the active view can't change under the menu). */
export async function openPageContextMenu(
  parent: BrowserWindow,
  webContents: WebContents,
  params: ContextMenuParams,
  viewBounds: Rectangle,
  nav: { canGoBack: boolean; canGoForward: boolean },
): Promise<void> {
  const seq = ++openSeq;
  const captured: Captured = {
    menuId: randomUUID(),
    contributions: [],
    canGoBack: nav.canGoBack,
    canGoForward: nav.canGoForward,
    pageUrl: params.pageURL,
    selectionText: params.selectionText.trim().slice(0, SELECTION_DISPLAY_MAX),
    linkUrl: params.linkURL,
    srcUrl: params.srcURL,
    mediaType: params.mediaType,
    isEditable: params.isEditable,
    canCopy: params.editFlags.canCopy,
    canCut: params.editFlags.canCut,
    canPaste: params.editFlags.canPaste,
    canSelectAll: params.editFlags.canSelectAll,
    x: params.x,
    y: params.y,
    parent,
    webContents,
  };
  const contributions = await PageContextMenuContributionService.collect(captured);
  if (seq !== openSeq || parent.isDestroyed() || webContents.isDestroyed()) return;
  last = { ...captured, contributions };
  const anchor: Rectangle = {
    x: viewBounds.x + params.x,
    y: viewBounds.y + params.y,
    width: 0,
    height: 0,
  };
  PopupWindowManager.open({
    parent,
    key: 'page-context-menu',
    query: { surface: 'page-context-menu' },
    anchor,
    width: WIDTH,
    height: HEIGHT,
    align: 'start',
  });
}

const EMPTY: PageMenuContext = {
  menuId: '',
  contributions: [],
  canGoBack: false,
  canGoForward: false,
  pageUrl: '',
  selectionText: '',
  linkUrl: '',
  srcUrl: '',
  mediaType: 'none',
  isEditable: false,
  canCopy: false,
  canCut: false,
  canPaste: false,
  canSelectAll: false,
};

/** The context the popup surface reads to pick its variant and enable rows. */
export function getPageMenuContext(): PageMenuContext {
  if (last === null) return EMPTY;
  // Return only the wire context (PageMenuContext) — the captured x/y point is main-process-only.
  const {
    menuId,
    contributions,
    canGoBack,
    canGoForward,
    pageUrl,
    selectionText,
    linkUrl,
    srcUrl,
    mediaType,
    isEditable,
    canCopy,
    canCut,
    canPaste,
    canSelectAll,
  } = last;
  return {
    menuId,
    contributions,
    canGoBack,
    canGoForward,
    pageUrl,
    selectionText,
    linkUrl,
    srcUrl,
    mediaType,
    isEditable,
    canCopy,
    canCut,
    canPaste,
    canSelectAll,
  };
}

export function runPageMenuContributionAction(input: PageMenuContributionActionInput): void {
  void PageContextMenuContributionService.runAction(input);
}

/** Run a wired page-menu action against the captured context (all act on the active web view). */
export function runPageMenuAction(action: PageMenuAction): void {
  const ctx = last;
  switch (action) {
    case 'back':
      TabManager.goBack();
      break;
    case 'forward':
      TabManager.goForward();
      break;
    case 'reload':
      TabManager.reloadActive();
      break;
    case 'view-source':
      TabManager.viewSourceActive();
      break;
    case 'inspect':
      if (ctx !== null) TabManager.inspectActiveAt(ctx.x, ctx.y);
      break;
    case 'print':
      TabManager.printActive();
      break;
    case 'save':
      TabManager.saveActive();
      break;
    case 'save-as-pdf':
      void savePageAsPdf();
      break;
    case 'copy':
      TabManager.copyActive();
      break;
    case 'cut':
      TabManager.cutActive();
      break;
    case 'paste':
      TabManager.pasteActive();
      break;
    case 'select-all':
      TabManager.selectAllActive();
      break;
    case 'search-selection':
      if (ctx !== null && ctx.selectionText.length > 0) {
        TabManager.createTab(searchUrl(ctx.selectionText), { openerId: opener() });
      }
      break;
    case 'copy-link':
      if (ctx !== null && ctx.linkUrl.length > 0) {
        ClipboardService.writeText({
          text: ctx.linkUrl,
          actor: 'user',
          origin: safeOrigin(ctx.pageUrl),
        });
      }
      break;
    case 'open-link-new-tab':
      if (ctx !== null && ctx.linkUrl.length > 0) {
        TabManager.createTab(ctx.linkUrl, { background: true, openerId: opener() });
      }
      break;
    case 'copy-image':
      if (ctx !== null) TabManager.copyImageAtActive(ctx.x, ctx.y);
      break;
    case 'copy-media-link':
      if (ctx !== null && ctx.srcUrl.length > 0) {
        ClipboardService.writeText({
          text: ctx.srcUrl,
          actor: 'user',
          origin: safeOrigin(ctx.pageUrl),
        });
      }
      break;
    case 'save-media':
      if (ctx !== null) TabManager.downloadUrlActive(ctx.srcUrl);
      break;
    case 'open-media-new-tab':
      if (ctx !== null && ctx.srcUrl.length > 0) {
        TabManager.createTab(ctx.srcUrl, { openerId: opener() });
      }
      break;
  }
}

/** The right-clicked page is the active tab, so it's the opener — new tabs inherit its group. */
function opener(): string | undefined {
  return TabManager.activeTabId() ?? undefined;
}

function safeOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}
