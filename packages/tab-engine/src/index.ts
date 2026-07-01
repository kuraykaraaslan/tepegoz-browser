/**
 * `@tepegoz/tab-engine` — the pure tab-state model (records, active tab, ordering, TabsState
 * projection). The desktop app's TabManager owns the WebContentsViews and delegates record state
 * here. Extracted from `apps/desktop` per docs/package-map.md.
 */
export { TabStore, type TabRecord, type TabKind } from './tab-store';
