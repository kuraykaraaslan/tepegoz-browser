import type { ReactNode } from 'react';
import { Icon } from '@tepegoz/ui';
import type { MenuItem } from '@tepegoz/browser-menu';
import type { PageContextMenuStrings } from './i18n/en';

/** The media kind under the cursor (mirrors Electron's `context-menu` params.mediaType). */
export type PageContextMenuMediaType =
  | 'none'
  | 'image'
  | 'audio'
  | 'video'
  | 'canvas'
  | 'file'
  | 'plugin';

/** Everything the model needs to pick its variant + enable rows (captured at right-click). */
export interface PageContextMenuContext {
  canGoBack: boolean;
  canGoForward: boolean;
  /** Selected text (trimmed/truncated), or '' if none. */
  selectionText: string;
  /** Link href under the cursor, or '' if not on a link. */
  linkUrl: string;
  /** Media/source URL under the cursor, or '' if not on media. */
  srcUrl: string;
  mediaType: PageContextMenuMediaType;
  isEditable: boolean;
  canCopy: boolean;
  canCut: boolean;
  canPaste: boolean;
  canSelectAll: boolean;
}

/** The wired callbacks. Placeholder rows (Cast, Lens, …) have none → rendered disabled/greyed. */
export interface PageContextMenuActions {
  back: () => void;
  forward: () => void;
  reload: () => void;
  save: () => void;
  print: () => void;
  viewSource: () => void;
  inspect: () => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  selectAll: () => void;
  searchSelection: () => void;
  copyLink: () => void;
  openLinkNewTab: () => void;
  copyImage: () => void;
  copyMediaLink: () => void;
  saveMedia: () => void;
  openMediaNewTab: () => void;
}

const SEP: MenuItem = { kind: 'separator' };
/** Longest selection shown inside the "Search the web for …" label before eliding. */
const SEARCH_LABEL_MAX = 40;

/** A wired row (has an action) or a disabled placeholder (no action → greyed, skipped by keyboard nav). */
function row(id: string, label: string, shortcut?: string, onSelect?: () => void): MenuItem {
  return {
    id,
    label,
    disabled: onSelect === undefined,
    ...(shortcut !== undefined ? { shortcut } : {}),
    ...(onSelect !== undefined ? { onSelect } : {}),
  };
}

/** A disabled placeholder row with a leading icon (mirrors Chrome's iconned secondary items). */
function placeholder(id: string, label: string, icon: ReactNode): MenuItem {
  return { id, label, icon, disabled: true };
}

function ellipsize(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Builds the Chrome-style page (web view) right-click menu model, branching on the right-click context:
 * editable field → Cut/Copy/Paste/Select all; link → open/copy link; image → open/save/copy image;
 * video/audio → open/save/copy address; text selection → Copy/Search/…; otherwise the generic page menu.
 * Wired rows carry `onSelect`; not-yet-implemented rows are disabled placeholders — the same convention
 * as the main (hamburger) menu.
 */
export function buildPageContextMenuModel(
  t: PageContextMenuStrings,
  ctx: PageContextMenuContext,
  actions: PageContextMenuActions,
): MenuItem[] {
  if (ctx.isEditable) return editableMenu(t, ctx, actions);
  if (ctx.linkUrl.length > 0) return linkMenu(t, ctx, actions);
  if (ctx.mediaType === 'image') return imageMenu(t, actions);
  if (ctx.mediaType === 'video' || ctx.mediaType === 'audio') return mediaMenu(t, actions);
  if (ctx.selectionText.length > 0) return selectionMenu(t, ctx, actions);
  return defaultMenu(t, ctx, actions);
}

/** Editable input/textarea/contenteditable → the standard editing commands (enabled per editFlags). */
function editableMenu(
  t: PageContextMenuStrings,
  ctx: PageContextMenuContext,
  a: PageContextMenuActions,
): MenuItem[] {
  return [
    row('cut', t.cut, 'Ctrl+X', ctx.canCut ? a.cut : undefined),
    row('copy', t.copy, 'Ctrl+C', ctx.canCopy ? a.copy : undefined),
    row('paste', t.paste, 'Ctrl+V', ctx.canPaste ? a.paste : undefined),
    row('select-all', t.selectAll, 'Ctrl+A', ctx.canSelectAll ? a.selectAll : undefined),
    SEP,
    row('inspect', t.inspect, undefined, a.inspect),
  ];
}

/** Right-click on a link (image links also get the image rows appended). */
function linkMenu(
  t: PageContextMenuStrings,
  ctx: PageContextMenuContext,
  a: PageContextMenuActions,
): MenuItem[] {
  const items: MenuItem[] = [
    row('open-link-new-tab', t.openLinkNewTab, undefined, a.openLinkNewTab),
    row('copy-link', t.copyLinkAddress, undefined, a.copyLink),
  ];
  if (ctx.mediaType === 'image') {
    items.push(
      SEP,
      row('open-image-new-tab', t.openImageNewTab, undefined, a.openMediaNewTab),
      row('save-image', t.saveImageAs, undefined, a.saveMedia),
      row('copy-image', t.copyImage, undefined, a.copyImage),
    );
  }
  if (ctx.selectionText.length > 0) {
    items.push(SEP, row('copy', t.copy, 'Ctrl+C', a.copy));
  }
  items.push(SEP, row('inspect', t.inspect, undefined, a.inspect));
  return items;
}

/** Right-click on an image. */
function imageMenu(t: PageContextMenuStrings, a: PageContextMenuActions): MenuItem[] {
  return [
    row('open-image-new-tab', t.openImageNewTab, undefined, a.openMediaNewTab),
    row('save-image', t.saveImageAs, undefined, a.saveMedia),
    row('copy-image', t.copyImage, undefined, a.copyImage),
    row('copy-image-address', t.copyImageAddress, undefined, a.copyMediaLink),
    SEP,
    row('inspect', t.inspect, undefined, a.inspect),
  ];
}

/** Right-click on a <video>/<audio> element. */
function mediaMenu(t: PageContextMenuStrings, a: PageContextMenuActions): MenuItem[] {
  return [
    row('open-media-new-tab', t.openMediaNewTab, undefined, a.openMediaNewTab),
    row('save-media', t.saveMediaAs, undefined, a.saveMedia),
    row('copy-media-address', t.copyMediaAddress, undefined, a.copyMediaLink),
    SEP,
    row('inspect', t.inspect, undefined, a.inspect),
  ];
}

/** Right-click with a text selection (not editable). */
function selectionMenu(
  t: PageContextMenuStrings,
  ctx: PageContextMenuContext,
  a: PageContextMenuActions,
): MenuItem[] {
  const searchLabel = t.searchWebFor.replace('%s', ellipsize(ctx.selectionText, SEARCH_LABEL_MAX));
  return [
    row('copy', t.copy, 'Ctrl+C', a.copy),
    placeholder('copy-link-highlight', t.copyLinkToHighlight, <Icon name="share" />),
    row('search-selection', searchLabel, undefined, a.searchSelection),
    SEP,
    row('print', t.print, 'Ctrl+P', a.print),
    placeholder('reading-mode', t.readingMode, <Icon name="book" />),
    placeholder('translate-selection', t.translateSelection, <Icon name="translate" />),
    SEP,
    placeholder('extensions', t.extensions, <Icon name="puzzle" />),
    SEP,
    row('inspect', t.inspect, undefined, a.inspect),
  ];
}

/** The generic page menu (no selection/link/media, not editable) — mirrors Chrome's default. */
function defaultMenu(
  t: PageContextMenuStrings,
  ctx: PageContextMenuContext,
  a: PageContextMenuActions,
): MenuItem[] {
  return [
    row('back', t.back, 'Alt+←', ctx.canGoBack ? a.back : undefined),
    row('forward', t.forward, 'Alt+→', ctx.canGoForward ? a.forward : undefined),
    row('reload', t.reload, 'Ctrl+R', a.reload),
    SEP,
    row('save', t.saveAs, 'Ctrl+S', a.save),
    row('print', t.print, 'Ctrl+P', a.print),
    row('cast', t.cast),
    SEP,
    placeholder('search-lens', t.searchLens, <Icon name="search" />),
    placeholder('reading-mode', t.readingMode, <Icon name="book" />),
    SEP,
    placeholder('send-devices', t.sendToDevices, <Icon name="devices" />),
    placeholder('create-qr', t.createQr, <Icon name="qrcode" />),
    SEP,
    placeholder('translate', t.translate, <Icon name="translate" />),
    SEP,
    placeholder('extensions', t.extensions, <Icon name="puzzle" />),
    SEP,
    row('view-source', t.viewSource, 'Ctrl+U', a.viewSource),
    row('inspect', t.inspect, undefined, a.inspect),
  ];
}
