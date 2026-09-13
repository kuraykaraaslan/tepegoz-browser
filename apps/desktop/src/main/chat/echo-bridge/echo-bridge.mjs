#!/usr/bin/env node
// The trivial bridge ADR-0048's Functional DoD calls for: a real, standalone child process (no
// TypeScript build step — a third-party bridge ships its own binary, this repo never compiles it)
// speaking the newline-JSON RPC `@tepegoz/adapter-subprocess` frames over stdio. It understands just
// enough of the `ChatAdapter` surface to prove the contract end to end: `connect` succeeds, `roster`
// / `listConversations` return empty, and `sendMessage` both acks the send AND immediately emits the
// same message back as an inbound `message` event (an "echo"), so a real event round-trips through
// the whole subprocess-adapter -> ProcessSupervisor -> stdio pipe -> chat-core normalizeEvent path.
//
// Deliberately NOT part of this: any filesystem or network confinement. This process has the same
// OS-level access as any other child `node` invocation — see `process-supervisor.ts`'s and
// `subprocess-adapter.ts`'s own docstrings for why (cwd/env are forwarded, not enforced) and
// `phases/extensions/ext-chat.md`'s X-chat.8 status for the open gap. This script exists to prove the
// RPC/lifecycle contract, not to demonstrate a sandbox that does not exist yet.

import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin, terminal: false });

function send(frame) {
  process.stdout.write(`${JSON.stringify(frame)}\n`);
}

let messageSeq = 0;

rl.on('line', (line) => {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return; // malformed input from the parent should never happen; drop rather than crash.
  }
  const { id, method, params } = req;

  switch (method) {
    case 'connect':
      send({ id, result: {} });
      return;
    case 'roster':
    case 'listConversations':
      send({ id, result: [] });
      return;
    case 'sendMessage': {
      const conv = params?.conv ?? 'echo-conv';
      const protocolId = `echo-${String(++messageSeq)}`;
      const now = Date.now();
      send({ id, result: { protocolId, ts: now } });
      // The "echo": immediately deliver the same body back as an inbound message event, proving a
      // real event flows from this child, over the real stdio pipe, back to the adapter's events().
      send({
        event: 'message',
        params: {
          type: 'message',
          message: {
            id: protocolId,
            conversationId: conv,
            accountId: process.env.TEPEGOZ_BRIDGE_ACCOUNT_ID ?? 'unknown',
            protocolId,
            senderAddress: 'echo-bridge',
            originTs: now,
            receivedAt: now,
            body: typeof params?.body?.text === 'string' ? params.body.text : '',
          },
        },
      });
      return;
    }
    default:
      send({ id, error: { message: `echo-bridge: unknown method "${String(method)}"` } });
  }
});
