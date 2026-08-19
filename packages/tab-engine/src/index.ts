/**
 * `@tepegoz/tab-engine` — the pure tab-state model (records, tab groups, pins, active tab, ordering,
 * TabsState projection). The desktop app's TabManager owns the WebContentsViews and delegates record
 * state here. Ordering & grouping invariants live in `TabStore.normalize()` (ADR-0020).
 *
 * It also owns the agent's built-in **`tab_*` capabilities** (`registerTabTools`) — tab enumeration/
 * creation is a tab-domain concern, registered as always-on builtins behind the ToolGateway PEP
 * (ADR-0021/0024 update), bound to an injected `TabHost`.
 */
export { TabStore } from './tab-store';
export { type TabHost, registerTabTools } from './tab-tools';
export {
  TAB_GROUP_COLORS,
  DEFAULT_GROUP_COLOR,
  type TabGroup,
  type TabGroupColor,
  type TabGroupInfo,
  type TabKind,
  type TabRecord,
} from './types';
export * from './task-metrics';
export * from './connection-binding';
