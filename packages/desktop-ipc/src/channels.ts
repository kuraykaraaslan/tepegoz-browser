/**
 * IPC channel names (`domain:action`) + internal page addresses — split from `contract.ts` to keep
 * each file under the 250-line cap. Same constraint applies: imported by the SANDBOXED preload, so
 * this file must stay dependency-free.
 */
import { ipcChannelsApp } from './channels-app';
import { ipcChannelsTabs } from './channels-tabs';
import { ipcChannelsAgent } from './channels-agent';
import { ipcChannelsNetwork } from './channels-network';
import { ipcChannelsTransfers } from './channels-transfers';
import { ipcChannelsChat } from './channels-chat';
import { ipcChannelsBrowser } from './channels-browser';
import { ipcChannelsWeb } from './channels-web';
import { ipcChannelsUserData } from './channels-user-data';

export const IpcChannels = {
  ...ipcChannelsApp,
  ...ipcChannelsTabs,
  ...ipcChannelsAgent,
  ...ipcChannelsNetwork,
  ...ipcChannelsTransfers,
  ...ipcChannelsChat,
  ...ipcChannelsBrowser,
  ...ipcChannelsWeb,
  ...ipcChannelsUserData,
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

/** Internal (browser-served) page addresses, shown in the omnibox like Chrome's `chrome://` pages. */
export const INTERNAL_NEWTAB_URL = 'tepegoz://newtab';
export const INTERNAL_SETTINGS_URL = 'tepegoz://settings';
export const INTERNAL_EXTENSIONS_URL = 'tepegoz://extensions';
export const INTERNAL_HISTORY_URL = 'tepegoz://history';
export const INTERNAL_DOWNLOADS_URL = 'tepegoz://downloads';
export const INTERNAL_UPLOADS_URL = 'tepegoz://uploads';
export const INTERNAL_TASKS_URL = 'tepegoz://tasks';
export const INTERNAL_BOOKMARKS_URL = 'tepegoz://bookmarks';
export const INTERNAL_PROCESS_URL = 'tepegoz://process';
/** Chrome-style profile manager — list / rename / delete / add (ADR-0045). */
export const INTERNAL_PROFILES_URL = 'tepegoz://profiles';
/** Developer surface (Chromium flags + raw preferences editor). Not linked from any menu, but any user
 *  can open it by typing the URL — deliberately, like Chrome's `chrome://flags` (ADR-0041). */
export const INTERNAL_DEVELOPER_URL = 'tepegoz://developer';
