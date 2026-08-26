import type { ReactNode } from 'react';
import { Icon } from '@tepegoz/ui';
import type { MenuItem } from '@tepegoz/browser-menu';
import { formatShortcut, SHORTCUTS, type ShortcutId } from '@tepegoz/shortcuts';
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
  savePdf: () => void;
  /** Toggle the reading view for this page. */
  readerMode: () => void;
  /** Capture what is on screen. */
  screenshotViewport: () => void;
  /** Capture the whole page, clipped if it is enormous. */
  screenshotFullPage: () => void;
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

/**
 * Which keys a row may advertise.
 *
 * These used to be free strings — `row('print', t.print, accel('print', platform), a.print)` — and the menu therefore
 * told the user about keys that were bound to NOTHING. `Ctrl+P`, `Ctrl+S` and `Ctrl+U` all printed
 * next to a row and did nothing when pressed; the commands existed, but only by right-click. A string
 * cannot be wrong here any more: a row names either a registry id or a platform built-in, and both are
 * closed unions, so an unbound key is a type error rather than a lie in the UI.
 */
type Accel = ShortcutId | PlatformBuiltin;

/**
 * Keys the PLATFORM binds, which is why they are NOT in `@tepegoz/shortcuts`: that registry is what the
 * app itself handles, and listing a key there we never dispatch would be the same lie in the other
 * direction. Chromium binds the editing commands inside a focused input, and the history keys at the
 * content layer.
 *
 * Spelled out per platform rather than run through `formatShortcut`, because these genuinely differ in
 * SHAPE and not just in notation: macOS navigates history with Cmd+arrow where Windows and Linux use
 * Alt+arrow. The old hardcoded strings said `Alt+←` on every platform, so a Mac was told the wrong key.
 */
type PlatformBuiltin = 'cut' | 'copy' | 'paste' | 'selectAll' | 'historyBack' | 'historyForward';

const PLATFORM_BUILTIN_LABELS: Record<PlatformBuiltin, { mac: string; other: string }> = {
  cut: { mac: '⌘X', other: 'Ctrl+X' },
  copy: { mac: '⌘C', other: 'Ctrl+C' },
  paste: { mac: '⌘V', other: 'Ctrl+V' },
  selectAll: { mac: '⌘A', other: 'Ctrl+A' },
  historyBack: { mac: '⌘←', other: 'Alt+←' },
  historyForward: { mac: '⌘→', other: 'Alt+→' },
};

function isPlatformBuiltin(id: Accel): id is PlatformBuiltin {
  return id in PLATFORM_BUILTIN_LABELS;
}

/** The label for a row's key, written the way `platform` writes it. */
export function accel(id: Accel, platform: string): string {
  if (isPlatformBuiltin(id)) {
    const label = PLATFORM_BUILTIN_LABELS[id];
    return platform === 'darwin' ? label.mac : label.other;
  }
  const spec = SHORTCUTS.find((s) => s.id === id);
  // Unreachable while `Accel` holds: `id` is a ShortcutId here, so the registry has it. Returning the
  // id rather than throwing keeps a menu from failing to open if that ever stops being true, and
  // `model.test.tsx` asserts every id this file uses resolves.
  return spec === undefined ? id : formatShortcut(spec, platform);
}

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
  platform: string,
): MenuItem[] {
  const core = ctx.isEditable
    ? editableMenu(t, ctx, actions, platform)
    : ctx.linkUrl.length > 0
      ? linkMenu(t, ctx, actions, platform)
      : ctx.mediaType === 'image'
        ? imageMenu(t, actions)
        : ctx.mediaType === 'video' || ctx.mediaType === 'audio'
          ? mediaMenu(t, actions)
          : ctx.selectionText.length > 0
            ? selectionMenu(t, ctx, actions, platform)
            : defaultMenu(t, ctx, actions, platform);
  return mergeContributions(ctx, actions, core);
}

/** Editable input/textarea/contenteditable → the standard editing commands (enabled per editFlags). */
function editableMenu(
  t: PageContextMenuStrings,
  ctx: PageContextMenuContext,
  a: PageContextMenuActions,
  platform: string,
): MenuItem[] {
  return [
    row('cut', t.cut, accel('cut', platform), ctx.canCut ? a.cut : undefined),
    row('copy', t.copy, accel('copy', platform), ctx.canCopy ? a.copy : undefined),
    row('paste', t.paste, accel('paste', platform), ctx.canPaste ? a.paste : undefined),
    row(
      'select-all',
      t.selectAll,
      accel('selectAll', platform),
      ctx.canSelectAll ? a.selectAll : undefined,
    ),
    SEP,
    row('inspect', t.inspect, undefined, a.inspect),
  ];
}

/** Right-click on a link (image links also get the image rows appended). */
function linkMenu(
  t: PageContextMenuStrings,
  ctx: PageContextMenuContext,
  a: PageContextMenuActions,
  platform: string,
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
    items.push(SEP, row('copy', t.copy, accel('copy', platform), a.copy));
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
  platform: string,
): MenuItem[] {
  const searchLabel = t.searchWebFor.replace('%s', ellipsize(ctx.selectionText, SEARCH_LABEL_MAX));
  return [
    row('copy', t.copy, accel('copy', platform), a.copy),
    placeholder('copy-link-highlight', t.copyLinkToHighlight, <Icon name="share" />),
    row('search-selection', searchLabel, undefined, a.searchSelection),
    SEP,
    row('print', t.print, accel('print', platform), a.print),
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
  platform: string,
): MenuItem[] {
  return [
    row('back', t.back, accel('historyBack', platform), ctx.canGoBack ? a.back : undefined),
    row(
      'forward',
      t.forward,
      accel('historyForward', platform),
      ctx.canGoForward ? a.forward : undefined,
    ),
    row('reload', t.reload, accel('reload', platform), a.reload),
    SEP,
    row('save', t.saveAs, accel('savePage', platform), a.save),
    row('print', t.print, accel('print', platform), a.print),
    // No accelerator: Chrome has none for this either — its Ctrl+P dialog carries the PDF destination.
    // A row may show no key at all; what it may not do is show one nothing binds.
    row('save-as-pdf', t.saveAsPdf, undefined, a.savePdf),
    row('reader-mode', t.readerMode, undefined, a.readerMode),
    row('screenshot-viewport', t.screenshotViewport, undefined, a.screenshotViewport),
    row('screenshot-full-page', t.screenshotFullPage, undefined, a.screenshotFullPage),
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
    row('view-source', t.viewSource, accel('viewSource', platform), a.viewSource),
    row('inspect', t.inspect, undefined, a.inspect),
  ];
}
