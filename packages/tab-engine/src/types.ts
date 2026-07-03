import type { TabGroupColor, TabGroupInfo, TabInfo } from '@tepegoz/desktop-ipc';

export type TabKind = 'web' | 'internal';

/** The ordered list of the fixed Chrome-style group colors — source for validation + cycling. */
export const TAB_GROUP_COLORS: readonly TabGroupColor[] = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const;

/** The default color for a freshly created group. */
export const DEFAULT_GROUP_COLOR: TabGroupColor = 'blue';

/**
 * A group record. Identical to the wire `TabGroupInfo` today; kept as an engine-local alias so the
 * store can evolve group-only fields (e.g. an engine-internal marker) without touching the wire type.
 */
export type TabGroup = TabGroupInfo;

/**
 * Pure, Electron-free tab record: the wire `TabInfo` (canonical shape, from the IPC contract) plus the
 * engine-only `kind` discriminator. A `web` tab is backed by a WebContentsView in the desktop app; an
 * `internal` tab (tepegoz://…) has no view and is rendered by the chrome. The view itself lives in the
 * app's TabManager, NOT here.
 */
export interface TabRecord extends TabInfo {
  kind: TabKind;
}

export type { TabGroupColor, TabGroupInfo };
