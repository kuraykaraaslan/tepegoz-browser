import {
  type ChatAdapterCaps,
  type ChatEvent,
  ChatEventSchema,
} from '@tepegoz/shared-types';

/**
 * The "prpl abstraction" boundary. Every adapter — native or an out-of-process bridge — hands the
 * core a stream of loosely-typed events. `normalizeEvent` is where they become trusted `ChatEvent`s:
 *
 * 1. **Validate.** `safeParse` against the one schema. A malformed / hostile event (a bridge is
 *    third-party code, an XMPP stanza is attacker-controlled) is dropped, never thrown past here.
 * 2. **Capability-gate.** An event describing a feature the protocol does not have is *dropped, not
 *    faked* — an `edit` from an adapter whose caps lack `edits` would otherwise land as a spurious
 *    new message; a `receipt` from a protocol without them is noise. Reactions/edits are stripped
 *    from a `message` when the caps say so, rather than the whole message being lost.
 */

export interface NormalizeResult {
  /** The event to apply, or `null` when it was rejected or gated out. */
  event: ChatEvent | null;
  /** Why it was dropped (for diagnostics / tests) — `null` when `event` is set. */
  dropped: 'invalid' | 'unsupported-capability' | null;
}

const CAP_FOR_TYPE: Partial<Record<ChatEvent['type'], keyof ChatAdapterCaps>> = {
  'message-edit': 'edits',
  'message-redact': 'edits',
  receipt: 'receipts',
  reaction: 'reactions',
  typing: 'typing',
  presence: 'presence',
  'room-membership': 'rooms',
  'room-topic': 'rooms',
};

/** Normalize one untrusted adapter event against the protocol's declared capabilities. */
export function normalizeEvent(raw: unknown, caps: ChatAdapterCaps): NormalizeResult {
  const parsed = ChatEventSchema.safeParse(raw);
  if (!parsed.success) return { event: null, dropped: 'invalid' };

  const event = parsed.data;
  const requiredCap = CAP_FOR_TYPE[event.type];
  if (requiredCap !== undefined && !caps[requiredCap]) {
    return { event: null, dropped: 'unsupported-capability' };
  }

  if (event.type === 'message') {
    const message = { ...event.message };
    if (!caps.reactions && message.reactions.length > 0) message.reactions = [];
    if (!caps.edits && message.editedAt !== null) message.editedAt = null;
    if (!caps.media && message.kind === 'media') {
      message.kind = 'text';
      message.mediaRef = null;
    }
    if (!caps.threads && message.replyToId !== null) message.replyToId = null;
    return { event: { type: 'message', message }, dropped: null };
  }

  return { event, dropped: null };
}

/** Convenience: normalize a batch, keeping only the events that survived. */
export function normalizeEvents(raw: readonly unknown[], caps: ChatAdapterCaps): ChatEvent[] {
  const out: ChatEvent[] = [];
  for (const item of raw) {
    const { event } = normalizeEvent(item, caps);
    if (event !== null) out.push(event);
  }
  return out;
}
