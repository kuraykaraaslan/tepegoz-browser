import { IRC_CAPS, MATRIX_CAPS, XMPP_CAPS, type ChatAdapter, type ChatSession } from '@tepegoz/chat-adapters';
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
 * `resolveMedia` is the one gap: it has no real bytes to hand back, so a scenario that needs the
 * media→sandbox round trip (`chat_media_to_sandbox`) cannot pass yet — a fixture media ref always
 * resolves to `null` here (see the `chat_get_media` capability), same as any protocol with no media
 * repo. Follow-up work, not attempted in this slice.
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
    resolveMedia: () => null,
    events: () => never,
  };
}
