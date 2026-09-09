import type { ChatEvent, ChatPresence, OutgoingMessage } from '@tepegoz/shared-types';
import type { ChatContact, ChatConversation } from '@tepegoz/shared-types';
import type {
  ChatAccountCreds,
  ChatAdapter,
  ChatSession,
  ConvId,
  HistoryPage,
  MsgId,
  SendReceipt,
} from '../adapter';
import { XMPP_CAPS } from '../caps';
import type { ChatTransport, DuplexStream } from '../transport';
import { XmlStreamParser, type XmlElement, type XmlStreamEvent } from './xml-stream';
import { type NegotiationAction, XmppNegotiator } from './negotiator';
import { StreamManager } from './stream-management';
import { buildMessage, buildPresence, buildReadMarker, stanzaToEvent } from './stanzas';

/**
 * The native in-process XMPP adapter (phase X-chat.1). Wires the injected `ChatTransport` to the
 * pure protocol modules: `XmlStreamParser` → `XmppNegotiator` (handshake) → `StreamManager`
 * (XEP-0198) → `stanzaToEvent` (live stanzas → raw `ChatEvent`s).
 *
 * Scope here: connect (direct-TLS or STARTTLS), the live event stream, `sendMessage`, `setPresence`,
 * `markRead`, `disconnect`. Roster and MAM history land in the next slice.
 */

const DEFAULT_PORT_TLS = 5223;
const DEFAULT_PORT_STARTTLS = 5222;
const NS_SM = 'urn:xmpp:sm:3';

export class XmppSession implements ChatSession {
  readonly caps = XMPP_CAPS;
  readonly selfBareJid: string;
  fullJid: string;
  closed = false;
  stream: DuplexStream;
  parser: XmlStreamParser;

  private readonly queue: ChatEvent[] = [];
  private readonly waiters: Array<(r: IteratorResult<ChatEvent>) => void> = [];
  private ended = false;

  constructor(
    readonly accountId: string,
    bareJid: string,
    stream: DuplexStream,
    readonly sm: StreamManager,
  ) {
    this.selfBareJid = bareJid.toLowerCase();
    this.fullJid = bareJid;
    this.stream = stream;
    this.parser = new XmlStreamParser(() => undefined);
  }

  private flush(): void {
    while (this.waiters.length > 0 && (this.queue.length > 0 || this.ended)) {
      const resolve = this.waiters.shift();
      if (resolve === undefined) break;
      const item = this.queue.shift();
      resolve(
        item !== undefined ? { value: item, done: false } : { value: undefined, done: true },
      );
    }
  }

  push(event: ChatEvent): void {
    if (this.ended) return;
    this.queue.push(event);
    this.flush();
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.closed = true;
    this.flush();
  }

  nextEvent(): Promise<IteratorResult<ChatEvent>> {
    const item = this.queue.shift();
    if (item !== undefined) return Promise.resolve({ value: item, done: false });
    if (this.ended) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

export class XmppAdapter implements ChatAdapter {
  readonly id = 'xmpp';
  readonly capabilities = XMPP_CAPS;

  async connect(creds: ChatAccountCreds, transport: ChatTransport): Promise<ChatSession> {
    if (creds.server.protocol !== 'xmpp') throw new Error('XmppAdapter: not an xmpp account');
    const server = creds.server;
    const jid = server.jid;
    const domain = jid.includes('@') ? jid.slice(jid.indexOf('@') + 1) : jid;
    const directTls = server.security === 'tls';
    const overWs = server.wsUrl !== null;

    let stream = overWs
      ? await transport.openWebSocket(server.wsUrl as string, ['xmpp'])
      : await transport.openTCP({
          host: server.host ?? domain,
          port: server.port ?? (directTls ? DEFAULT_PORT_TLS : DEFAULT_PORT_STARTTLS),
          tls: directTls,
          serverName: domain,
        });

    const sm = new StreamManager();
    const negotiator = new XmppNegotiator({
      jid,
      password: creds.secret,
      resource: 'tepegoz',
      tlsActive: directTls || overWs,
    });

    let negotiating = true;
    const decoder = new TextDecoder();
    const session = new XmppSession(creds.accountId, jid, stream, sm);

    let resolveReady: () => void = () => undefined;
    let rejectReady: (e: Error) => void = () => undefined;
    const onErr = (e: unknown): void =>
      rejectReady(e instanceof Error ? e : new Error(String(e)));

    const bind = (s: DuplexStream): void => {
      s.onData((chunk) => session.parser.feed(decoder.decode(chunk)));
      s.onClose((err) => {
        if (negotiating) onErr(err ?? new Error('stream closed during negotiation'));
        else session.end();
      });
    };

    const runActions = (actions: NegotiationAction[]): void => {
      for (const action of actions) {
        if (session.closed) return;
        switch (action.kind) {
          case 'send':
            stream.write(action.xml);
            break;
          case 'restart-stream':
            session.parser = new XmlStreamParser(onStreamEvent);
            stream.write(action.xml);
            break;
          case 'starttls':
            void transport
              .upgradeTLS(stream, { host: domain })
              .then((tls) => {
                stream = tls;
                session.stream = tls;
                bind(tls);
                return negotiator.feed({ t: 'tls-established' });
              })
              .then(runActions)
              .catch(onErr);
            break;
          case 'ready':
            session.fullJid = action.fullJid;
            negotiating = false;
            resolveReady();
            break;
          case 'failed':
            onErr(new Error(`XMPP negotiation failed: ${action.reason}`));
            break;
        }
      }
    };

    function onStreamEvent(evt: XmlStreamEvent): void {
      if (evt.type === 'error') {
        if (negotiating) onErr(new Error(`xml stream error: ${evt.message}`));
        return;
      }
      if (evt.type === 'close') {
        if (!negotiating) session.end();
        return;
      }
      if (evt.type === 'open') {
        void negotiator.feed({ t: 'stream-open', attrs: evt.attrs }).then(runActions).catch(onErr);
        return;
      }
      if (negotiating) {
        void negotiator.feed({ t: 'element', el: evt.element }).then(runActions).catch(onErr);
        return;
      }
      handleLiveElement(session, evt.element);
    }

    session.parser = new XmlStreamParser(onStreamEvent);

    await new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
      bind(stream);
      runActions(negotiator.start());
    });

    return session;
  }

  disconnect(session: ChatSession): Promise<void> {
    const s = session as XmppSession;
    if (!s.closed) {
      try {
        s.stream.write('</stream:stream>');
        s.stream.close();
      } catch {
        /* best-effort */
      }
      s.end();
    }
    return Promise.resolve();
  }

  roster(): Promise<ChatContact[]> {
    return Promise.resolve([]); // roster round-trip lands in the next slice
  }

  setPresence(session: ChatSession, presence: ChatPresence, statusText?: string): Promise<void> {
    const s = session as XmppSession;
    const show =
      presence === 'away' || presence === 'xa' || presence === 'dnd' ? presence : undefined;
    s.stream.write(buildPresence(show, statusText));
    return Promise.resolve();
  }

  listConversations(): Promise<ChatConversation[]> {
    return Promise.resolve([]);
  }

  history(): Promise<HistoryPage> {
    return Promise.resolve({ messages: [], nextCursor: null });
  }

  sendMessage(session: ChatSession, conv: ConvId, body: OutgoingMessage): Promise<SendReceipt> {
    const s = session as XmppSession;
    const id = `t-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
    const xml = buildMessage({ to: conv, body: body.body, id, requestReceipt: true });
    s.stream.write(xml);
    s.sm.trackOutbound(xml);
    return Promise.resolve({ protocolId: id, ts: Date.now() });
  }

  markRead(session: ChatSession, conv: ConvId, upTo: MsgId): Promise<void> {
    (session as XmppSession).stream.write(buildReadMarker(conv, upTo));
    return Promise.resolve();
  }

  async *events(session: ChatSession): AsyncIterable<unknown> {
    const s = session as XmppSession;
    for (;;) {
      const next = await s.nextEvent();
      if (next.done === true) return;
      yield next.value;
    }
  }
}

function handleLiveElement(session: XmppSession, el: XmlElement): void {
  if (el.ns === NS_SM) {
    if (el.local === 'r') {
      session.stream.write(session.sm.ackAnswerXml());
      return;
    }
    if (el.local === 'a') {
      session.sm.onAck(el);
      return;
    }
  }

  if (el.local === 'message' || el.local === 'presence' || el.local === 'iq') {
    session.sm.countInbound();
    const event = stanzaToEvent(el, {
      accountId: session.accountId,
      selfBareJid: session.selfBareJid,
      now: Date.now(),
    });
    if (event !== null) session.push(event);
  }
}
