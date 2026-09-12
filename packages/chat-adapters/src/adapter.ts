import type {
  ChatAdapterCaps,
  ChatContact,
  ChatConversation,
  ChatEvent,
  ChatMessage,
  ChatPresence,
  ChatServerConfig,
  OutgoingMessage,
} from '@tepegoz/shared-types';
import type { ChatTransport } from './transport';

/**
 * The `ChatAdapter` contract — the Pidgin/libpurple "prpl" applied to the ADR-0021 injected-host
 * seam. A native adapter (XMPP/IRC/Matrix) runs in-process in `ChatService`; a bridge
 * (Telegram/Slack/…) implements the *same* interface over an RPC to a sandboxed child process.
 *
 * An adapter never touches the DB, the UI, or the vault. It receives the resolved secret at
 * `connect`, speaks its wire, and emits **raw** events — `@tepegoz/chat-core`'s `normalizeEvent`
 * validates and capability-gates them before anything downstream trusts them.
 */

export interface ChatAccountCreds {
  accountId: string;
  server: ChatServerConfig;
  /** Plaintext secret, resolved from the vault by the host at connect time. The adapter uses it and
   *  never persists it. */
  secret: string;
}

export interface ChatSession {
  readonly accountId: string;
  /** The capabilities negotiated for THIS connection (may narrow the protocol preset — e.g. a server
   *  without MAM drops `historySync`). */
  readonly caps: ChatAdapterCaps;
}

export type ConvId = string;
export type MsgId = string;

export interface HistoryPage {
  messages: ChatMessage[];
  /** Opaque cursor for the next (older) page, or `null` at the start of history. */
  nextCursor: string | null;
}

export interface SendReceipt {
  /** The server-assigned protocol id — the host uses it to reconcile the optimistic echo. */
  protocolId: string;
  ts: number;
}

/** Where the host can fetch an attachment's bytes: an absolute URL plus the headers to send. */
export interface MediaLocator {
  url: string;
  headers: Record<string, string>;
}

/** Attachment bytes the host read from the sandbox, ready for a protocol media-repository upload. */
export interface OutgoingMedia {
  bytes: Uint8Array;
  mime: string;
  filename: string;
}

/** One room a directory / conference service advertises (XEP-0030 disco for XMPP). */
export interface RoomSummary {
  /** Bare room JID (`room@service`). */
  jid: string;
  name: string | null;
  description: string | null;
  /** Advertised occupant count, or `null` when the room does not publish it. */
  occupants: number | null;
  passwordProtected: boolean;
  membersOnly: boolean;
}

export interface ChatAdapter {
  readonly id: string;
  /** The protocol's maximum capabilities (a connection may narrow them — see {@link ChatSession}). */
  readonly capabilities: ChatAdapterCaps;

  connect(creds: ChatAccountCreds, transport: ChatTransport): Promise<ChatSession>;
  disconnect(session: ChatSession): Promise<void>;

  roster(session: ChatSession): Promise<ChatContact[]>;
  /** Add a contact to the roster and request to see their presence. Optional — a protocol with no
   *  roster/subscription concept (IRC, Matrix) omits it; the UI hides the add-contact affordance
   *  when it's absent. The contact itself arrives asynchronously via the usual roster-change event
   *  once the server roster-pushes it back (and again once the subscription is approved). */
  addContact?(session: ChatSession, address: string): Promise<void>;
  setPresence(session: ChatSession, presence: ChatPresence, statusText?: string): Promise<void>;

  listConversations(session: ChatSession): Promise<ChatConversation[]>;
  history(session: ChatSession, conv: ConvId, before: string | null): Promise<HistoryPage>;

  sendMessage(session: ChatSession, conv: ConvId, body: OutgoingMessage): Promise<SendReceipt>;
  editMessage?(session: ChatSession, conv: ConvId, id: MsgId, body: OutgoingMessage): Promise<void>;
  react?(session: ChatSession, conv: ConvId, id: MsgId, emoji: string, on: boolean): Promise<void>;
  markRead(session: ChatSession, conv: ConvId, upTo: MsgId): Promise<void>;

  joinRoom?(session: ChatSession, address: string): Promise<ChatConversation>;
  leaveRoom?(session: ChatSession, conv: ConvId): Promise<void>;
  /** Invite a contact to a room. `invitee` is the protocol address (JID / nick / Matrix user id);
   *  the server delivers the invitation. Write-only — any resulting membership change arrives on
   *  the event stream. Optional; a protocol / room without invites omits it. */
  inviteToRoom?(session: ChatSession, conv: ConvId, invitee: string): Promise<void>;
  /** Change a room's topic / subject. The server's echo drives the `room-topic` event that updates
   *  local state — this only writes. Optional; a protocol / room without topic support omits it. */
  setRoomTopic?(session: ChatSession, conv: ConvId, topic: string): Promise<void>;
  /** Discover the rooms a conference / directory service advertises. */
  discoverRooms?(session: ChatSession, service: string): Promise<RoomSummary[]>;

  /**
   * Upload attachment bytes (the host has already read them from the file-operations sandbox);
   * returns a protocol `mediaRef` (e.g. `mxc://…`) to pass to `sendMessage`.
   */
  uploadMedia?(session: ChatSession, media: OutgoingMedia): Promise<string>;

  /**
   * Resolve a message `mediaRef` (a protocol URI, e.g. `mxc://…`) to a fetchable location. The host
   * performs the egress-bound GET with these headers and quarantines the bytes — the Node-free
   * adapter never handles them. `null` when the ref is malformed or the protocol has no media repo.
   */
  resolveMedia?(session: ChatSession, mediaRef: string): MediaLocator | null;

  /** The live event stream. Yields **raw** (unvalidated) events shaped like `ChatEvent`. */
  events(session: ChatSession): AsyncIterable<unknown>;
}

/** A `ChatEvent` producer signature, for adapters that expose a callback rather than an async
 *  iterable internally. */
export type RawEventSink = (raw: unknown) => void;

/** Re-exported for adapter authors composing their own event objects. */
export type { ChatEvent };
