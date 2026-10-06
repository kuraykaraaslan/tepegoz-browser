import type {
  ChatContact,
  ChatConversation,
  ChatPresence,
  OutgoingMessage,
} from '@tepegoz/shared-types';
import type {
  ChatAccountCreds,
  ChatAdapter,
  ChatSession,
  ConvId,
  HistoryPage,
  SendReceipt,
} from '../adapter';
import { IRC_CAPS } from '../caps';
import type { ChatTransport } from '../transport';
import { parseIrcLine, parseIsupport, type IrcMessage } from './parse';
import { IrcRegistration, type RegistrationAction } from './registration';
import {
  asIrcCasemapping,
  buildIrcAway,
  buildIrcJoin,
  buildIrcInvite,
  buildIrcNick,
  buildIrcNickServIdentify,
  buildIrcPart,
  buildIrcPrivmsg,
  buildIrcTopic,
  ircKickSystemMessage,
  ircMessageToEvent,
  namesReplyToEvents,
  parseIrcPrefixSpec,
  type IrcContext,
} from './messages';
import { IrcSession } from './session';

export { IrcSession };

const DEFAULT_PORT_TLS = 6697;
const DEFAULT_PORT_PLAIN = 6667;
const IRC_HISTORY_LIMIT = 50;
const IRC_HISTORY_TIMEOUT_MS = 15_000;
/** How long `sendMessage` waits for the server's own-echo (`echo-message` cap) before falling back
 *  to a synthetic receipt id — see the `ownEchoWaiters` note on {@link IrcSession}. */
const IRC_OWN_ECHO_TIMEOUT_MS = 5_000;

export class IrcAdapter implements ChatAdapter {
  readonly id = 'irc';
  readonly capabilities = IRC_CAPS;

  async connect(creds: ChatAccountCreds, transport: ChatTransport): Promise<ChatSession> {
    if (creds.server.protocol !== 'irc') throw new Error('IrcAdapter: not an irc account');
    const server = creds.server;

    const stream = await transport.openTCP({
      host: server.server,
      port: server.port || (server.tls ? DEFAULT_PORT_TLS : DEFAULT_PORT_PLAIN),
      tls: server.tls,
      serverName: server.server,
    });

    const session = new IrcSession(creds.accountId, server.nick, stream);
    const external = server.saslMechanism === 'external';
    // Pre-SASL account auth: `PASS` before registration (default) or a `NickServ IDENTIFY` message
    // sent once after `001`. Only one path fires, and only when SASL is off with a secret present.
    const nickServ = !server.sasl && server.preSaslAuth === 'nickserv' && creds.secret.length > 0;
    const registration = new IrcRegistration({
      nick: server.nick,
      user: server.nick,
      // A `PASS` only makes sense as the fallback when SASL is off and NickServ was not chosen.
      ...(creds.secret.length > 0 && !server.sasl && !nickServ ? { password: creds.secret } : {}),
      ...(server.sasl
        ? {
            sasl: external
              ? ({ mechanism: 'EXTERNAL' } as const)
              : ({ mechanism: 'PLAIN', username: server.nick, password: creds.secret } as const),
          }
        : {}),
    });

    let registering = true;
    const decoder = new TextDecoder();

    return new Promise<ChatSession>((resolve, reject) => {
      const runActions = (actions: RegistrationAction[]): void => {
        for (const action of actions) {
          if (action.kind === 'send') session.write(action.line);
          else if (action.kind === 'registered') {
            registering = false;
            session.nick = action.nick;
            session.ircCaps = registration.ackedCaps;
            // Pre-SASL services auth: identify to NickServ now that we have a nick.
            if (nickServ) session.write(buildIrcNickServIdentify(creds.secret));
            resolve(session);
          } else {
            registering = false;
            session.end();
            reject(new Error(`IRC registration failed: ${action.reason}`));
          }
        }
      };

      stream.onData((chunk) => {
        for (const line of session.takeLines(decoder.decode(chunk))) {
          const msg = parseIrcLine(line);
          if (msg === null) continue;
          if (msg.command === 'PING') {
            session.write(`PONG :${msg.params[0] ?? ''}`);
            continue;
          }
          if (registering) {
            runActions(registration.feed(msg));
            continue;
          }
          if (msg.command === '005') {
            const map = parseIsupport(msg.params);
            if (typeof map.CHANTYPES === 'string') session.chanTypes = map.CHANTYPES;
            const casemapping = asIrcCasemapping(map.CASEMAPPING);
            if (casemapping !== null) session.casemapping = casemapping;
            if (typeof map.PREFIX === 'string') {
              const symbols = parseIrcPrefixSpec(map.PREFIX);
              if (symbols !== '') session.prefixSymbols = symbols;
            }
            continue;
          }
          if (this.handleBatch(session, msg)) continue;
          this.handleLive(session, msg);
        }
      });

      stream.onClose((err) => {
        if (registering) reject(err ?? new Error('connection closed during registration'));
        else session.end();
      });

      runActions(registration.start());
    });
  }

  /**
   * IRCv3 `batch`: `BATCH +ref TYPE [args]` opens, tagged lines join it, `BATCH -ref` closes. A
   * `chathistory` batch's messages resolve the matching {@link history} promise; other batch members
   * fall through to the live stream. Returns whether the line was consumed by the batch machinery.
   */
  private handleBatch(session: IrcSession, msg: IrcMessage): boolean {
    if (msg.command === 'BATCH') {
      const token = msg.params[0] ?? '';
      const ref = token.slice(1);
      if (token.startsWith('+')) {
        session.batches.set(ref, {
          type: msg.params[1] ?? '',
          target: session.fold(msg.params[2] ?? ''),
          lines: [],
        });
        return true;
      }
      if (token.startsWith('-')) {
        const batch = session.batches.get(ref);
        session.batches.delete(ref);
        if (batch !== undefined && batch.type === 'chathistory') {
          const resolve = session.historyWaiters.get(batch.target);
          if (resolve !== undefined) {
            session.historyWaiters.delete(batch.target);
            resolve(batch.lines);
          }
          return true;
        }
        return batch?.type === 'chathistory';
      }
      return false;
    }
    const batchRef = msg.tags.batch;
    if (batchRef !== undefined) {
      const batch = session.batches.get(batchRef);
      if (batch?.type === 'chathistory') {
        batch.lines.push(msg);
        return true;
      }
    }
    return false;
  }

  private handleLive(session: IrcSession, msg: IrcMessage): void {
    const ctx: IrcContext = {
      accountId: session.accountId,
      selfNick: session.nick,
      chanTypes: session.chanTypes,
      casemapping: session.casemapping,
      prefixSymbols: session.prefixSymbols,
      now: Date.now(),
    };
    // RPL_NAMREPLY lists many occupants in one line → fan out to one membership event each.
    if (msg.command === '353') {
      for (const e of namesReplyToEvents(msg, ctx)) session.push(e);
      return;
    }
    // Track our own channel membership so a reconnect can auto-rejoin.
    if (
      (msg.command === 'JOIN' || msg.command === 'PART') &&
      msg.prefix?.startsWith(`${session.nick}!`)
    ) {
      const chan = msg.params[0] !== undefined ? session.fold(msg.params[0]) : undefined;
      if (chan !== undefined) {
        if (msg.command === 'JOIN') session.joined.add(chan);
        else session.joined.delete(chan);
      }
    }
    const event = ircMessageToEvent(msg, ctx);
    if (event !== null) {
      // Our own echoed message (`echo-message` cap) resolves the matching `sendMessage` — see the
      // `ownEchoWaiters` note on `IrcSession`. FIFO: our own sends to one conversation are ordered,
      // and so are their echoes.
      if (event.type === 'message' && event.message.senderAddress === session.nick) {
        const queue = session.ownEchoWaiters.get(session.fold(event.message.conversationId));
        queue?.shift()?.(event.message.protocolId);
      }
      session.push(event);
    }
    // A KICK is both a membership change (above) and a visible system line in the channel.
    const kick = ircKickSystemMessage(msg, ctx);
    if (kick !== null) session.push(kick);
  }

  disconnect(session: ChatSession): Promise<void> {
    const s = session as IrcSession;
    try {
      s.write('QUIT :bye');
      s.stream.close();
    } catch {
      /* best-effort */
    }
    s.end();
    return Promise.resolve();
  }

  roster(): Promise<ChatContact[]> {
    return Promise.resolve([]); // IRC has no roster
  }

  setPresence(session: ChatSession, presence: ChatPresence, statusText?: string): Promise<void> {
    const s = session as IrcSession;
    s.enqueue(presence === 'online' ? buildIrcAway() : buildIrcAway(statusText ?? 'away'));
    return Promise.resolve();
  }

  listConversations(): Promise<ChatConversation[]> {
    return Promise.resolve([]);
  }

  history(session: ChatSession, conv: ConvId, before: string | null): Promise<HistoryPage> {
    const s = session as IrcSession;
    if (!s.ircCaps.has('draft/chathistory') && !s.ircCaps.has('chathistory')) {
      return Promise.resolve({ messages: [], nextCursor: null });
    }
    const target = s.fold(conv);
    const selector = before !== null ? `timestamp=${before}` : '*';
    return new Promise<HistoryPage>((resolve) => {
      const timer = setTimeout(() => {
        s.historyWaiters.delete(target);
        resolve({ messages: [], nextCursor: null });
      }, IRC_HISTORY_TIMEOUT_MS);
      s.historyWaiters.set(target, (lines) => {
        clearTimeout(timer);
        const ctx: IrcContext = {
          accountId: s.accountId,
          selfNick: s.nick,
          chanTypes: s.chanTypes,
          casemapping: s.casemapping,
          prefixSymbols: s.prefixSymbols,
          now: Date.now(),
        };
        const messages = lines
          .map((m) => ircMessageToEvent(m, ctx))
          .filter((e): e is Extract<typeof e, { type: 'message' }> => e?.type === 'message')
          .map((e) => e.message)
          .sort((a, b) => a.originTs - b.originTs);
        const oldest = messages[0];
        resolve({
          messages,
          nextCursor:
            messages.length > 0 && oldest !== undefined
              ? new Date(oldest.originTs).toISOString()
              : null,
        });
      });
      s.enqueue(`CHATHISTORY BEFORE ${conv} ${selector} ${IRC_HISTORY_LIMIT}`);
    });
  }

  sendMessage(session: ChatSession, conv: ConvId, body: OutgoingMessage): Promise<SendReceipt> {
    const s = session as IrcSession;
    const ts = Date.now();
    const fallback = { protocolId: `${String(ts)}~${s.nick}~${body.body.slice(0, 40)}`, ts };
    s.enqueue(buildIrcPrivmsg(conv, body.body));
    if (!s.ircCaps.has('echo-message')) return Promise.resolve(fallback);

    const target = s.fold(conv);
    return new Promise<SendReceipt>((resolve) => {
      let onEcho: (protocolId: string) => void = () => undefined;
      const timer = setTimeout(() => {
        const queue = s.ownEchoWaiters.get(target);
        const idx = queue?.indexOf(onEcho) ?? -1;
        if (queue !== undefined && idx !== -1) queue.splice(idx, 1);
        resolve(fallback);
      }, IRC_OWN_ECHO_TIMEOUT_MS);
      onEcho = (protocolId: string): void => {
        clearTimeout(timer);
        resolve({ protocolId, ts });
      };
      const queue = s.ownEchoWaiters.get(target) ?? [];
      queue.push(onEcho);
      s.ownEchoWaiters.set(target, queue);
    });
  }

  markRead(): Promise<void> {
    return Promise.resolve(); // IRC has no read receipts
  }

  joinRoom(session: ChatSession, address: string): Promise<ChatConversation> {
    const s = session as IrcSession;
    const channel = s.fold(address);
    s.enqueue(buildIrcJoin(address));
    s.joined.add(channel);
    return Promise.resolve({
      id: channel,
      accountId: s.accountId,
      kind: 'room',
      address: channel,
      name: address,
      topic: '',
      memberCount: 0,
      unread: 0,
      mentions: 0,
      lastReadId: null,
      muted: false,
      mutedUntil: null,
      notifyLevel: 'all',
      isKnownContact: true,
      archived: false,
      lastMessage: null,
      updatedAt: Date.now(),
    });
  }

  leaveRoom(session: ChatSession, conv: ConvId): Promise<void> {
    const s = session as IrcSession;
    s.enqueue(buildIrcPart(conv));
    s.joined.delete(s.fold(conv));
    return Promise.resolve();
  }

  changeNick(session: ChatSession, nick: string): Promise<void> {
    (session as IrcSession).enqueue(buildIrcNick(nick));
    return Promise.resolve();
  }

  setRoomTopic(session: ChatSession, conv: ConvId, topic: string): Promise<void> {
    (session as IrcSession).enqueue(buildIrcTopic(conv, topic));
    return Promise.resolve();
  }

  inviteToRoom(session: ChatSession, conv: ConvId, invitee: string): Promise<void> {
    (session as IrcSession).enqueue(buildIrcInvite(invitee, conv));
    return Promise.resolve();
  }

  async *events(session: ChatSession): AsyncIterable<unknown> {
    const s = session as IrcSession;
    for (;;) {
      const next = await s.nextEvent();
      if (next.done === true) return;
      yield next.value;
    }
  }
}
