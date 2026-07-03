/**
 * `@tepegoz/tab-engine` — the pure tab-state model (records, tab groups, pins, active tab, ordering,
 * TabsState projection). The desktop app's TabManager owns the WebContentsViews and delegates record
 * state here. Ordering & grouping invariants live in `TabStore.normalize()` (ADR-0020).
 */
export { TabStore } from './tab-store';
export {
  TAB_GROUP_COLORS,
  DEFAULT_GROUP_COLOR,
  type TabGroup,
  type TabGroupColor,
  type TabGroupInfo,
  type TabKind,
  type TabRecord,
} from './types';
