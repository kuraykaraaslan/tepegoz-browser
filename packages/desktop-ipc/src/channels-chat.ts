/**
 * Messenger channels. Part of `IpcChannels` (see `channels.ts`); dependency-free
 * because the SANDBOXED preload imports it.
 */
export const ipcChannelsChat = {
  // Multi-protocol messenger (`com.tepegoz.chat`). Accounts + conversations + roster live in the
  // profile DB; the main-process ChatService owns every socket and pushes state/changes live.
  chatListAccounts: 'chat:list-accounts',
  chatAddAccount: 'chat:add-account',
  /** Renderer→main: read one account's full (non-secret) config, to prefill an edit form. */
  chatGetAccount: 'chat:get-account',
  /** Renderer→main: update an account's config and, optionally, its vault secret (`null` keeps the
   *  existing one) — reconnects the account with the new settings. */
  chatUpdateAccount: 'chat:update-account',
  chatRemoveAccount: 'chat:remove-account',
  chatListConversations: 'chat:list-conversations',
  chatGetHistory: 'chat:get-history',
  chatGetRoster: 'chat:get-roster',
  chatSendMessage: 'chat:send-message',
  chatSetPresence: 'chat:set-presence',
  chatMarkRead: 'chat:mark-read',
  /** Renderer→main: browse a MUC service's advertised rooms (XEP-0030 disco). */
  chatDiscoverRooms: 'chat:discover-rooms',
  /** Renderer→main: join a MUC room by its bare JID. */
  chatJoinRoom: 'chat:join-room',
  /** Renderer→main: leave a room — the conversation stays in history but stops being "known". */
  chatLeaveRoom: 'chat:leave-room',
  /** Renderer→main: set a room's notification level (all / mentions / none). */
  chatSetRoomNotifyLevel: 'chat:set-room-notify-level',
  /** Renderer→main: mute / unmute one conversation (DM or room). */
  chatSetMuted: 'chat:set-muted',
  chatMuteFor: 'chat:mute-for',
  chatSetArchived: 'chat:set-archived',
  chatBlockContact: 'chat:block-contact',
  /** Renderer→main: change a room's topic / subject. */
  chatSetRoomTopic: 'chat:set-room-topic',
  /** Renderer→main: invite a contact to a room. */
  chatInviteToRoom: 'chat:invite-to-room',
  /** Renderer→main: resolve a message's `mediaRef` to a quarantined `data:` URL (main fetches). */
  chatResolveMedia: 'chat:resolve-media',
  /** Renderer→main: add / remove one of the local user's emoji reactions on a message. */
  chatReact: 'chat:react',
  chatEditMessage: 'chat:edit-message',
  /** Renderer→main: add a contact to the roster and request their presence. */
  chatAddContact: 'chat:add-contact',
  /** Renderer→main: remove a contact from the roster and cancel any subscription. */
  chatRemoveContact: 'chat:remove-contact',
  /** Main→renderer push: per-account connection state + folded conversation/roster changes. */
  chatState: 'chat:state',
} as const;
