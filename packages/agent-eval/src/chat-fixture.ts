import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChatEvalFixtureSchema, type ChatEvalFixture } from '@tepegoz/shared-types';

/**
 * Loader for a `chatFixture` scenario's seed (X-chat.6 agent-eval). A scenario whose `target` is
 * `{ chatFixture: "<name>" }` names `<dir>/<name>.chat.json` — a {@link ChatEvalFixtureSchema} seed
 * of accounts / roster / conversations / messages. Like the scenario registry, the file is UNTRUSTED
 * disk input: it is `safeParse`d and a bad file is returned as an `error` string, never thrown, so a
 * single broken fixture cannot crash a run.
 *
 * The harness (`*.eval.ts`) seeds `ChatStore` from the returned fixture and runs the agent with the
 * `chat_*` tools against a `ChatCapabilityHost` — no network adapter, no live XMPP/IRC/Matrix server.
 * These pure functions are unit-tested without a browser.
 */

export interface LoadedChatFixture {
  fixture: ChatEvalFixture | null;
  error: string | null;
}

/** The on-disk name for a chat-fixture, given a scenario's `chatFixture` value. */
export function chatFixtureFile(name: string): string {
  return `${name}.chat.json`;
}

export function loadChatFixture(dir: string, name: string): LoadedChatFixture {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    return { fixture: null, error: `invalid chat-fixture name "${name}"` };
  }
  const path = join(dir, chatFixtureFile(name));
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    return { fixture: null, error: `cannot read ${chatFixtureFile(name)}: ${String(err)}` };
  }
  const parsed = ChatEvalFixtureSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fixture: null,
      error: `schema: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
    };
  }
  return { fixture: parsed.data, error: null };
}

/**
 * Whether a seeded conversation should be visible to the agent by default — the unknown-contact gate,
 * mirrored here so a scenario author can assert "this DM is withheld" without booting the host. A
 * room is always visible; a DM is visible when its peer is a roster contact, the conversation is
 * flagged `knownContact`, or the user opted it in.
 */
export function isSeedConversationAgentVisible(
  fixture: ChatEvalFixture,
  conversationId: string,
): boolean {
  const conv = fixture.conversations.find((c) => c.id === conversationId);
  if (conv === undefined) return false;
  if (conv.kind === 'room' || conv.optedIn || conv.knownContact) return true;
  const roster = new Set(fixture.roster);
  return conv.messages.some((m) => m.from !== 'me' && roster.has(m.from));
}
