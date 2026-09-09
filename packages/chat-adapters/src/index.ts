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
