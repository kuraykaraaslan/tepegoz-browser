/**
 * User agent, popup blocker, adblock, typo, translate, player, adaptors, notification and certificate/auth channels. Part of `IpcChannels` (see `channels.ts`); dependency-free
 * because the SANDBOXED preload imports it.
 */
export const ipcChannelsWeb = {
  userAgentGet: 'user-agent:get',
  userAgentSet: 'user-agent:set',
  popupBlockerGet: 'popup-blocker:get',
  popupBlockerSet: 'popup-blocker:set',
  popupBlockerTrust: 'popup-blocker:trust',
  popupBlockerRecentRequests: 'popup-blocker:recent-requests',
  adblockGet: 'adblock:get',
  adblockSet: 'adblock:set',
  adblockState: 'adblock:state',
  adblockSiteSet: 'adblock:site-set',
  adblockRefresh: 'adblock:refresh',
  typoGet: 'typo:get',
  typoSet: 'typo:set',
  typoState: 'typo:state',
  typoCheck: 'typo:check',
  typoDictionariesList: 'typo-dictionaries:list',
  typoDictionariesState: 'typo-dictionaries:state',
  typoDictionaryDownload: 'typo-dictionaries:download',
  typoDictionaryCancel: 'typo-dictionaries:cancel',
  typoDictionaryDelete: 'typo-dictionaries:delete',
  typoDictionaryShowFolder: 'typo-dictionaries:show-folder',
  typoSiteSet: 'typo:site-set',
  typoIgnoredWordAdd: 'typo:ignored-word-add',
  translateGet: 'translate:get',
  translateSet: 'translate:set',
  translateState: 'translate:state',
  translateText: 'translate:text',
  translatePageStart: 'translate-page:start',
  translatePageRestore: 'translate-page:restore',
  translatePageState: 'translate-page:state',
  translateSiteSet: 'translate:site-set',
  translateGlossaryAdd: 'translate-glossary:add',
  translateGlossaryRemove: 'translate-glossary:remove',
  translateCloudFallbackRequest: 'translate-cloud:request',
  translateCloudFallbackRespond: 'translate-cloud:respond',
  // Unified Player (ext-video-player). `video-player:page-state` is a main→renderer push carrying the
  // number of `<video>` elements skinned on the active tab.
  videoPlayerGet: 'video-player:get',
  videoPlayerSet: 'video-player:set',
  videoPlayerState: 'video-player:state',
  videoPlayerSiteSet: 'video-player:site-set',
  videoPlayerPageState: 'video-player:page-state',
  mcpGetStatus: 'mcp:get-status',
  adaptorsList: 'adaptors:list',
  /** Renderer→main: the live AIAdaptor inventory (system + extension + MCP groups, each with its
   *  actions) for the Settings "run locally" list — built from the single CapabilityRegistry. */
  aiAdaptorsList: 'ai-adaptors:list',
  // Notification center: list/mutate the persisted center, plus main→renderer pushes for live state,
  // transient toasts, and the per-site Web Notification consent prompt.
  notificationsList: 'notifications:list',
  notificationsDismiss: 'notifications:dismiss',
  notificationsDismissAll: 'notifications:dismiss-all',
  notificationsMarkRead: 'notifications:mark-read',
  notificationsMarkAllRead: 'notifications:mark-all-read',
  notificationsState: 'notifications:state',
  notificationsToast: 'notifications:toast',
  /** main→renderer: a TLS certificate error is waiting on the user. */
  certificateErrorRequest: 'cert:request',
  /** renderer→main: proceed past the certificate error, or refuse. */
  certificateErrorRespond: 'cert:respond',
  /** main→renderer: a site asked the user to identify themselves with a client certificate. */
  clientCertificateRequest: 'cert:client-request',
  /** renderer→main: which offered certificate to send, or none. */
  clientCertificateRespond: 'cert:client-respond',
  /** Review + withdraw the per-origin client-certificate choices this run remembers. */
  clientCertificateList: 'cert:client-list',
  clientCertificateForget: 'cert:client-forget',
  /** main→renderer: an HTTP 401/407 challenge is waiting on the user. */
  authBasicRequest: 'auth:basic-request',
  /** renderer→main: the credentials, or a cancellation. */
  authBasicRespond: 'auth:basic-respond',
  /** renderer→main: use the saved password-vault credential offered on the pending challenge. */
  authBasicUseSaved: 'auth:basic-use-saved',
} as const;
