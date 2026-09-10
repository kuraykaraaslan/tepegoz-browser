/**
 * `@tepegoz/chat-adapters` — the `ChatAdapter` contract + `ChatTransport` port + per-protocol
 * capability presets for `@tepegoz/ext-chat` (phase X-chat.1). Electron- and Node-free: the desktop
 * `ChatService` supplies a concrete transport whose streams are egress-bound. Native adapters
 * (XMPP/IRC/Matrix) and sandboxed bridge adapters implement the same interface.
 */

export type {
  DuplexStream,
  EventStream,
  OpenTcpOptions,
  ChatFetchInit,
  ChatFetchResponse,
  ChatTransport,
} from './transport';

export type {
  ChatAccountCreds,
  ChatSession,
  ChatAdapter,
  ConvId,
  MsgId,
  HistoryPage,
  SendReceipt,
  MediaLocator,
  OutgoingMedia,
  RoomSummary,
  RawEventSink,
  ChatEvent,
} from './adapter';

export {
  XMPP_CAPS,
  IRC_CAPS,
  MATRIX_CAPS,
  BRIDGE_DEFAULT_CAPS,
  capsFor,
  negotiateCaps,
} from './caps';

export {
  XmlStreamParser,
  decodeXmlText,
  encodeXmlText,
  child,
  children,
  text,
  childText,
  type XmlElement,
  type XmlStreamEvent,
} from './xmpp/xml-stream';

export {
  NS as XMPP_NS,
  stanzaToEvent,
  buildMessage,
  buildChatState,
  buildReceipt,
  buildReadMarker,
  buildPresence,
  type StanzaContext,
  type OutgoingChatMessage,
} from './xmpp/stanzas';

export {
  parseStreamFeatures,
  pickSaslMechanism,
  type StreamFeatures,
} from './xmpp/features';

export {
  XmppNegotiator,
  type NegotiatorConfig,
  type NegotiatorInput,
  type NegotiationAction,
} from './xmpp/negotiator';

export { StreamManager, type StreamManagerOptions } from './xmpp/stream-management';

export { XmppAdapter } from './xmpp/adapter';

export {
  NS_MAM,
  buildMamQuery,
  parseMamResult,
  parseMamFin,
  type MamQuery,
  type MamFin,
} from './xmpp/mam';

export {
  NS_DISCO_ITEMS,
  NS_DISCO_INFO,
  buildDiscoItems,
  buildDiscoInfo,
  parseDiscoItems,
  parseDiscoInfo,
  type DiscoItem,
  type DiscoIdentity,
  type DiscoInfo,
  type DiscoRoomInfo,
} from './xmpp/disco';

export {
  NS_MUC,
  NS_MUC_USER,
  MUC_AFFILIATIONS,
  MUC_ROLES,
  buildMucJoin,
  buildMucLeave,
  buildMucChangeSubject,
  buildMucInvite,
  parseMucPresence,
  parseMucSubject,
  parseMucError,
  type MucAffiliation,
  type MucRole,
  type MucOccupant,
  type MucJoinOptions,
  type MucSubject,
  type MucError,
  type MucErrorCondition,
} from './xmpp/muc';

export {
  discoverXmpp,
  discoverWebSocketEndpoints,
  explicitCandidate,
  sortSrv,
  type DiscoveryPorts,
  type SrvRecord,
  type ConnectionCandidate,
} from './xmpp/autodiscover';

export {
  IRC_MAX_LINE,
  parseIrcLine,
  formatIrcLine,
  parseIsupport,
  type IrcMessage,
} from './irc/parse';

export {
  ircMessageToEvent,
  namesReplyToEvents,
  foldIrcTarget,
  asIrcCasemapping,
  parseIrcPrefixSpec,
  splitMembershipPrefix,
  IRC_CASEMAPPINGS,
  buildIrcPrivmsg,
  buildIrcAction,
  buildIrcJoin,
  buildIrcPart,
  buildIrcNick,
  buildIrcAway,
  type IrcContext,
  type IrcCasemapping,
} from './irc/messages';

export {
  IRC_WANTED_CAPS,
  IrcRegistration,
  type RegistrationConfig as IrcRegistrationConfig,
  type RegistrationAction as IrcRegistrationAction,
} from './irc/registration';

export { IrcAdapter, IrcSession } from './irc/adapter';

export {
  matrixTimelineEvent,
  matrixEphemeralEvents,
  type MatrixRoomEvent,
  type MatrixContext,
} from './matrix/events';

export {
  parseSyncResponse,
  type SyncResult,
  type SyncRoom,
  type SyncInvite,
} from './matrix/sync';

export { MatrixAdapter, MatrixSession, MATRIX_ADAPTER_CAPS } from './matrix/adapter';

export {
  MATRIX_MEDIA_UPLOAD_PATH,
  parseMxc,
  mxcDownloadUrl,
  mxcThumbnailUrl,
  type MxcRef,
  type ThumbnailOptions,
} from './matrix/media';

export {
  bytesToB64,
  b64ToBytes,
  saslPlain,
  startScram,
  scramClientFirst,
  scramFinal,
  scramVerify,
  type ScramState,
  type ScramHash,
  type ScramFinalResult,
} from './xmpp/sasl';
