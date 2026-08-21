import type { ReactNode } from 'react';
import { Icon } from '@tepegoz/ui';
import type { MenuItem } from '@tepegoz/browser-menu';
import type { PageContextMenuStrings } from './i18n/en';

/** The media kind under the cursor (mirrors Electron's `context-menu` params.mediaType). */
export type PageContextMenuMediaType =
  'none' | 'image' | 'audio' | 'video' | 'canvas' | 'file' | 'plugin';

export type PageMenuContributionPlacement = 'top' | 'before-edit' | 'before-inspect' | 'bottom';

export interface PageMenuContributionItem {
  id: string;
  label: string;
  actionId: string;
  payload?: unknown;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
}

export interface PageMenuContributionSection {
  id: string;
  contributorId: string;
  title?: string;
  placement: PageMenuContributionPlacement;
  priority: number;
  items: PageMenuContributionItem[];
}

export interface PageMenuContributionActionInput {
  menuId: string;
  contributorId: string;
  sectionId: string;
  itemId: string;
  actionId: string;
  payload?: unknown;
}

/** Everything the model needs to pick its variant + enable rows (captured at right-click). */
export interface PageContextMenuContext {
  menuId: string;
  contributions: PageMenuContributionSection[];
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
  contribution: (input: PageMenuContributionActionInput) => void;
}

const SEP: MenuItem = { kind: 'separator' };
/** Longest selection shown inside the "Search the web for …" label before eliding. */
const SEARCH_LABEL_MAX = 40;
const EDIT_ITEM_IDS = new Set(['cut', 'copy', 'paste', 'select-all']);

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

function menuItemId(item: MenuItem): string | undefined {
  return item.kind === undefined || item.kind === 'item' ? item.id : undefined;
}

function isSeparator(item: MenuItem): boolean {
  return item.kind === 'separator';
}

function compactMenu(items: MenuItem[]): MenuItem[] {
  const compact: MenuItem[] = [];
  for (const item of items) {
    if (isSeparator(item)) {
      const previous = compact[compact.length - 1];
      if (previous === undefined || isSeparator(previous)) continue;
    }
    compact.push(item);
  }
  while (true) {
    const last = compact[compact.length - 1];
    if (last === undefined || !isSeparator(last)) break;
    compact.pop();
  }
  return compact;
}

function contributionRows(
  ctx: PageContextMenuContext,
  placement: PageMenuContributionPlacement,
  a: PageContextMenuActions,
): MenuItem[] {
  const sections = ctx.contributions
    .filter((section) => section.placement === placement && section.items.length > 0)
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  const rows: MenuItem[] = [];
  for (const section of sections) {
    if (rows.length > 0) rows.push(SEP);
    if (section.title !== undefined && section.title.length > 0) {
      rows.push({ kind: 'label', id: `contribution-label:${section.id}`, text: section.title });
    }
    for (const item of section.items) {
      const disabled = item.disabled === true;
      const contributionInput: PageMenuContributionActionInput = {
        menuId: ctx.menuId,
        contributorId: section.contributorId,
        sectionId: section.id,
        itemId: item.id,
        actionId: item.actionId,
        ...(item.payload !== undefined ? { payload: item.payload } : {}),
      };
      rows.push({
        id: `contribution:${section.contributorId}:${section.id}:${item.id}`,
        label: item.label,
        disabled,
        ...(item.shortcut !== undefined ? { shortcut: item.shortcut } : {}),
        ...(item.danger !== undefined ? { danger: item.danger } : {}),
        ...(disabled ? {} : { onSelect: () => a.contribution(contributionInput) }),
      });
    }
  }
  return rows;
}

function mergeContributions(
  ctx: PageContextMenuContext,
  a: PageContextMenuActions,
  core: MenuItem[],
): MenuItem[] {
  const top = contributionRows(ctx, 'top', a);
  const beforeEdit = contributionRows(ctx, 'before-edit', a);
  const beforeInspect = contributionRows(ctx, 'before-inspect', a);
  const bottom = contributionRows(ctx, 'bottom', a);
  if (
    top.length === 0 &&
    beforeEdit.length === 0 &&
    beforeInspect.length === 0 &&
    bottom.length === 0
  ) {
    return core;
  }

  const merged: MenuItem[] = [];
  if (top.length > 0) merged.push(...top, SEP);
  let editInserted = false;
  let inspectInserted = false;
  for (const item of core) {
    const id = menuItemId(item);
    if (!editInserted && id !== undefined && EDIT_ITEM_IDS.has(id)) {
      if (beforeEdit.length > 0) merged.push(...beforeEdit, SEP);
      editInserted = true;
    }
    if (!inspectInserted && id === 'inspect') {
      if (beforeInspect.length > 0) merged.push(...beforeInspect, SEP);
      inspectInserted = true;
    }
    merged.push(item);
  }
  if (!editInserted && beforeEdit.length > 0) merged.push(SEP, ...beforeEdit);
  if (!inspectInserted && beforeInspect.length > 0) merged.push(SEP, ...beforeInspect);
  if (bottom.length > 0) merged.push(SEP, ...bottom);
  return compactMenu(merged);
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
  const core = ctx.isEditable
    ? editableMenu(t, ctx, actions)
    : ctx.linkUrl.length > 0
      ? linkMenu(t, ctx, actions)
      : ctx.mediaType === 'image'
        ? imageMenu(t, actions)
        : ctx.mediaType === 'video' || ctx.mediaType === 'audio'
          ? mediaMenu(t, actions)
          : ctx.selectionText.length > 0
            ? selectionMenu(t, ctx, actions)
            : defaultMenu(t, ctx, actions);
  return mergeContributions(ctx, actions, core);
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
