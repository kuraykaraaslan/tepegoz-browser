import { IRC_CAPS, MATRIX_CAPS, XMPP_CAPS, type ChatAdapter, type ChatSession } from '@tepegoz/chat-adapters';
import type { ChatFetchResponse, ChatTransport } from '@tepegoz/chat-adapters';
import type { ChatEvalFixture } from '@tepegoz/shared-types';

/**
 * X-chat.6 slice 3 — the no-op `ChatAdapter` a `chatFixture` eval trial runs its `ChatService` on
 * instead of a real XMPP/IRC/Matrix adapter. Every seeded conversation/message already lives in the
 * local store (`chat-eval-fixture.ts` writes it before the trial starts), so this adapter contributes
 * nothing over the wire — it exists only so `ChatAccountRunner` has a session (every write action
 * calls `requireSession()`) without ever opening a real socket. `connect` resolves immediately;
 * every read merges with the local rows the runner already reads first; every write "succeeds"
 * locally-only, which matters for the safety scenarios (a violation — e.g. the agent sending when it
 * shouldn't — has to actually show up as a delivered message for the eval to be able to fail it).
 *
 * `resolveMedia` resolves any non-empty ref to a `eval-media:` locator — a scheme no real network
 * dialer understands, paired with {@link createChatEvalTransport} below (the eval-only `ChatTransport`
 * `buildChatService` swaps in for the real `NodeChatTransport` whenever a fixture is active) so the
 * `chat_media_to_sandbox` scenario's `chat_get_media` → `ChatAccountRunner.resolveMedia` →
 * `transport.fetch` round trip resolves to real, quarantine-able bytes without ever touching the
 * actual network — the fixture's `media` ref content is never asserted byte-for-byte (the scenario's
 * judge rubric only checks the agent went through `chat_get_media`/quarantine, not what the picture
 * looks like), so a fixed placeholder image is enough.
 */
export function createChatEvalAdapter(protocol: ChatEvalFixture['protocol']): ChatAdapter {
  const caps = protocol === 'irc' ? IRC_CAPS : protocol === 'matrix' ? MATRIX_CAPS : XMPP_CAPS;
  const never: AsyncIterable<unknown> = {
    [Symbol.asyncIterator]: () => ({
      next: () => new Promise<IteratorResult<unknown>>(() => undefined),
    }),
  };
  return {
    id: protocol,
    capabilities: caps,
    connect: (creds) => Promise.resolve({ accountId: creds.accountId, caps }),
    disconnect: () => Promise.resolve(),
    roster: () => Promise.resolve([]),
    setPresence: () => Promise.resolve(),
    listConversations: () => Promise.resolve([]),
    history: () => Promise.resolve({ messages: [], nextCursor: null }),
    sendMessage: () => Promise.resolve({ protocolId: `eval-${String(Date.now())}`, ts: Date.now() }),
    markRead: () => Promise.resolve(),
    joinRoom: (_session: ChatSession, address: string) =>
      Promise.resolve({
        id: address,
        accountId: '',
        kind: 'room' as const,
        address,
        name: address,
        topic: '',
        memberCount: 0,
        unread: 0,
        mentions: 0,
        lastReadId: null,
        muted: false,
        notifyLevel: 'all' as const,
        isKnownContact: true,
        updatedAt: Date.now(),
      }),
    leaveRoom: () => Promise.resolve(),
    react: () => Promise.resolve(),
    resolveMedia: (_session: ChatSession, mediaRef: string) =>
      mediaRef.length > 0 ? { url: `${EVAL_MEDIA_SCHEME}${encodeURIComponent(mediaRef)}`, headers: {} } : null,
    events: () => never,
  };
}

const EVAL_MEDIA_SCHEME = 'eval-media:';

/** A minimal, valid 1x1 transparent PNG — real decodable bytes, deliberately not tied to any
 *  particular fixture's `media` ref content (see the class docstring above for why). */
const EVAL_MEDIA_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/**
 * The eval-only `ChatTransport` `chat-service.electron.ts` swaps in for the real `NodeChatTransport`
 * whenever `TEPEGOZ_EVAL_CHAT_FIXTURE` is set. Every method except `fetch` on an `eval-media:` URL
 * rejects loudly — nothing in `createChatEvalAdapter` calls any of them (a native adapter's `connect`
 * takes a transport; this no-op adapter's `connect` never touches it), so a call here would mean a
 * real IO path opened during a trial, which must fail hard rather than silently reach the network.
 */
export function createChatEvalTransport(): ChatTransport {
  const refuse = (label: string) => (): Promise<never> =>
    Promise.reject(new Error(`chat eval transport: no real ${label} during an eval trial`));
  return {
    openTCP: refuse('TCP'),
    upgradeTLS: refuse('TLS upgrade'),
    openWebSocket: refuse('WebSocket'),
    openEventStream: refuse('event stream'),
    fetch: (url: string): Promise<ChatFetchResponse> => {
      if (!url.startsWith(EVAL_MEDIA_SCHEME)) {
        return Promise.reject(new Error(`chat eval transport: no real fetch of "${url}" during an eval trial`));
      }
      const bytes = Buffer.from(EVAL_MEDIA_PNG_BASE64, 'base64');
      return Promise.resolve({
        status: 200,
        headers: { 'content-type': 'image/png' },
        text: () => Promise.resolve(bytes.toString('utf8')),
        bytes: () => Promise.resolve(new Uint8Array(bytes)),
      });
    },
  };
}
