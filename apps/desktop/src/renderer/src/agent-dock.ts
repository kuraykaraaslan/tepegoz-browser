import type { TabGroupSettingValue } from '@tepegoz/desktop-ipc';

/** The Agent Console's extension id + the `TabGroupSettingKey` remembering its open/closed state per
 *  tab group (the existing sidebar toggle button doubles as the per-group control — no new UI). */
export const AGENT_EXTENSION_ID = 'com.tepegoz.agent';
export const AGENT_PANEL_OPEN_KEY = 'agent.panelOpen';

/**
 * What the sidebar dock should hold after the active tab's group changed. Pure so the rule is
 * testable without a renderer; `cur` is the currently docked extension id (or null).
 *
 * - **Ungrouped active tab** (a plain new tab): it has no group, so there is no agent session — the
 *   panel keys on the group id and would render open but inert. The Agent Console closes; any OTHER
 *   extension the user docked is left alone.
 * - **Grouped, with a remembered value**: honour it, but never yank away a different docked extension.
 * - **Grouped, no value yet** (brand-new group, e.g. the one the agent just created for its own tabs):
 *   leave the dock exactly as it is — no forced default, no surprise toggle.
 */
export function nextAgentDock(
  cur: string | null,
  activeGroupId: string | null,
  panelOpen: TabGroupSettingValue | undefined,
): string | null {
  if (activeGroupId === null) return cur === AGENT_EXTENSION_ID ? null : cur;
  if (panelOpen === undefined) return cur;
  if (cur !== null && cur !== AGENT_EXTENSION_ID) return cur;
  return panelOpen === true ? AGENT_EXTENSION_ID : null;
}
