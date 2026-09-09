/**
 * `@tepegoz/chat-transport-node` — a Node (`net`/`tls`) + global `WebSocket`/`fetch` implementation
 * of `@tepegoz/chat-adapters`' `ChatTransport`. Electron-free; the desktop `ChatService` injects an
 * egress-bound dialer so every chat connection rides the active profile's Phase-5 binding.
 */
export {
  NodeChatTransport,
  consumeSse,
  type RawDuplex,
  type NodeTransportPorts,
} from './node-transport';
