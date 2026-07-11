import { type Rectangle, type WebContents } from 'electron';
import { type TabGroupSettingValue, type TabsState } from '@tepegoz/desktop-ipc';
import { type TabGroupColor } from '@tepegoz/tab-engine';
import { TabManagerBase } from './tabs-manager-base';
import { EMPTY_TABS_STATE } from './tabs-shared';

/**
 * Static registry + facade over the per-window `WindowTabs` instances. Window-scoped IPC resolves the
 * sender window via {@link TabManagerBase.forWindow}; agent / menu / host code that means "the current
 * browser" resolves the {@link TabManagerBase.focused} window. Registry + session-wide concerns live in
 * {@link TabManagerBase}; this class carries the many thin per-window delegates.
 *
 * The many agent / macro / task / menu / host callers that predate multi-window keep calling
 * `TabManager.x(...)`; each resolves the focused window. IPC handlers that know their sender window
 * call `TabManager.forWindow(win).x(...)` directly for window-accurate routing.
 */
export default class TabManager extends TabManagerBase {
  // ── Facade (delegates to the focused window) ───────────────────────────────────────────────────

  static createTab(rawUrl?: string, opts?: { background?: boolean; openerId?: string | undefined }): string | null {
    return TabManager.focused()?.createTab(rawUrl, opts) ?? null;
  }
  static activeTabId(): string | null {
    return TabManager.focused()?.activeTabId() ?? null;
  }
  static viewlessActiveTabId(): string | null {
    return TabManager.focused()?.viewlessActiveTabId() ?? null;
  }
  static activate(id: string): void {
    TabManager.focused()?.activate(id);
  }
  static closeTab(id: string): void {
    TabManager.focused()?.closeTab(id);
  }
  static reloadTab(id: string): void {
    TabManager.focused()?.reloadTab(id);
  }
  static openInternalPage(url: string): void {
    TabManager.focused()?.openInternalPage(url);
  }
  static createTabRight(refId: string): void {
    TabManager.focused()?.createTabRight(refId);
  }
  static duplicateTab(id: string): void {
    TabManager.focused()?.duplicateTab(id);
  }
  static closeOtherTabs(id: string): void {
    TabManager.focused()?.closeOtherTabs(id);
  }
  static closeTabsToRight(id: string): void {
    TabManager.focused()?.closeTabsToRight(id);
  }
  static moveTab(id: string, toIndex: number, intoGroupId?: string | null): void {
    TabManager.focused()?.moveTab(id, toIndex, intoGroupId);
  }
  static moveGroup(groupId: string, toIndex: number): void {
    TabManager.focused()?.moveGroup(groupId, toIndex);
  }
  static createGroup(memberIds?: string[]): string {
    return TabManager.focused()?.createGroup(memberIds) ?? '';
  }
  static hasGroup(groupId: string): boolean {
    return TabManager.focused()?.hasGroup(groupId) ?? false;
  }
  static assignToGroup(tabId: string, groupId: string): void {
    TabManager.focused()?.assignToGroup(tabId, groupId);
  }
  static removeFromGroup(tabId: string): void {
    TabManager.focused()?.removeFromGroup(tabId);
  }
  static renameGroup(groupId: string, name: string): void {
    TabManager.focused()?.renameGroup(groupId, name);
  }
  static recolorGroup(groupId: string, color: TabGroupColor): void {
    TabManager.focused()?.recolorGroup(groupId, color);
  }
  static setGroupCollapsed(groupId: string, collapsed: boolean): void {
    TabManager.focused()?.setGroupCollapsed(groupId, collapsed);
  }
  static updateGroupSettings(groupId: string, patch: Record<string, TabGroupSettingValue>): void {
    TabManager.focused()?.updateGroupSettings(groupId, patch);
  }
  static ungroup(groupId: string): void {
    TabManager.focused()?.ungroup(groupId);
  }
  static newTabInGroup(groupId: string): void {
    TabManager.focused()?.newTabInGroup(groupId);
  }
  static closeGroup(groupId: string): void {
    TabManager.focused()?.closeGroup(groupId);
  }
  static groupMenuInfo(groupId: string): { color: TabGroupColor } | undefined {
    return TabManager.focused()?.groupMenuInfo(groupId);
  }
  static setPinned(id: string, pinned: boolean): void {
    TabManager.focused()?.setPinned(id, pinned);
  }
  static navigateActive(rawUrl: string): void {
    TabManager.focused()?.navigateActive(rawUrl);
  }
  static navigateTab(id: string, rawUrl: string): boolean {
    return TabManager.focused()?.navigateTab(id, rawUrl) ?? false;
  }
  static goBack(): void {
    TabManager.focused()?.goBack();
  }
  static goForward(): void {
    TabManager.focused()?.goForward();
  }
  static reloadActive(): void {
    TabManager.focused()?.reloadActive();
  }
  static printActive(): void {
    TabManager.focused()?.printActive();
  }
  static viewSourceActive(): void {
    TabManager.focused()?.viewSourceActive();
  }
  static saveActive(): void {
    TabManager.focused()?.saveActive();
  }
  static downloadUrlActive(url: string): void {
    TabManager.focused()?.downloadUrlActive(url);
  }
  static copyActive(): void {
    TabManager.focused()?.copyActive();
  }
  static cutActive(): void {
    TabManager.focused()?.cutActive();
  }
  static pasteActive(): void {
    TabManager.focused()?.pasteActive();
  }
  static selectAllActive(): void {
    TabManager.focused()?.selectAllActive();
  }
  static copyImageAtActive(x: number, y: number): void {
    TabManager.focused()?.copyImageAtActive(x, y);
  }
  static inspectActiveAt(x: number, y: number): void {
    TabManager.focused()?.inspectActiveAt(x, y);
  }
  static goHome(): void {
    TabManager.focused()?.goHome();
  }
  static getContentBounds(): Rectangle {
    return TabManager.focused()?.getContentBounds() ?? { x: 0, y: 0, width: 0, height: 0 };
  }
  static setContentBounds(bounds: Rectangle): void {
    TabManager.focused()?.setContentBounds(bounds);
  }
  static setContentVisible(visible: boolean): void {
    TabManager.focused()?.setContentVisible(visible);
  }
  static getState(): TabsState {
    return TabManager.focused()?.getState() ?? EMPTY_TABS_STATE;
  }
  static activeWebContents(): WebContents | null {
    return TabManager.focused()?.activeWebContents() ?? null;
  }
  static webContentsForTab(id: string): WebContents | null {
    return TabManager.focused()?.webContentsForTab(id) ?? null;
  }
  static captureActive(): Promise<string | null> {
    return TabManager.focused()?.captureActive() ?? Promise.resolve(null);
  }
  static reopenClosedTab(): void {
    TabManager.focused()?.reopenClosedTab();
  }
}
