/**
 * The injected transport port. `@tepegoz/chat-adapters` is Electron- and Node-free; the desktop
 * `ChatService` supplies a concrete `ChatTransport` whose streams are bound to the active profile's
 * network egress ([Phase 5](../../../phases/product/phase-5-vpn-network-privacy.md)) — a bridge or a
 * native adapter can never open a socket that dodges the kill-switch.
 */

/** A bidirectional byte stream (a TCP/TLS socket, or a WebSocket carrying binary frames). */
export interface DuplexStream {
  /** Send bytes (or a UTF-8 string, encoded by the host). */
  write(data: Uint8Array | string): void;
  /** Register the data callback. Called once; the host buffers nothing before it is set. */
  onData(cb: (chunk: Uint8Array) => void): void;
  /** Called once when the stream ends — cleanly (`err` undefined) or on error. */
  onClose(cb: (err?: Error) => void): void;
  close(): void;
}

export interface OpenTcpOptions {
  host: string;
  port: number;
  /** Implicit TLS from the first byte. STARTTLS upgrades happen via {@link DuplexStream} re-open at
   *  the adapter's request through a separate `upgradeTLS` the host wires per protocol. */
  tls: boolean;
  /** SNI / cert-verification hostname when it differs from `host`. */
  serverName?: string;
}

export interface ChatFetchInit {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  /** A UTF-8 string, or raw bytes for a media-repository upload. */
  body?: string | Uint8Array;
  /** Abort the request after this many ms. */
  timeoutMs?: number;
}

export interface ChatFetchResponse {
  status: number;
  headers: Record<string, string>;
  text(): Promise<string>;
  /** The raw response body — for media-repository downloads (`mxc://` etc.). */
  bytes(): Promise<Uint8Array>;
}

/** An open server-sent-events / long-poll stream for JMAP/Matrix-style push. */
export interface EventStream {
  onEvent(cb: (data: string) => void): void;
  onError(cb: (err: Error) => void): void;
  close(): void;
}

export interface ChatTransport {
  openTCP(opts: OpenTcpOptions): Promise<DuplexStream>;
  /**
   * Upgrade an already-open plaintext TCP stream to TLS in place (XMPP STARTTLS, RFC 6120 §5). The
   * returned stream replaces the old one — the caller re-registers its `onData` / `onClose`. `host`
   * is the certificate-verification hostname (the XMPP domain, not a resolved A record).
   */
  upgradeTLS(stream: DuplexStream, opts: { host: string }): Promise<DuplexStream>;
  openWebSocket(url: string, protocols?: string[]): Promise<DuplexStream>;
  fetch(url: string, init?: ChatFetchInit): Promise<ChatFetchResponse>;
  openEventStream(url: string, init?: ChatFetchInit): Promise<EventStream>;
}
