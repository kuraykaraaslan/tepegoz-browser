import type { ChatAccountCreds, ChatSession } from '../adapter';
import type { ChatTransport, DuplexStream } from '../transport';
import { XmlStreamParser, type XmlStreamEvent } from './xml-stream';
import { type NegotiationAction, XmppNegotiator } from './negotiator';
import { StreamManager } from './stream-management';
import { handleLiveElement } from './live-handlers';
import { XmppSession } from './session';

const DEFAULT_PORT_TLS = 5223;
const DEFAULT_PORT_STARTTLS = 5222;

/** Open the transport, run the XMPP negotiation (TLS/STARTTLS, SASL, bind, SM) and resolve the live session. */
export async function connectXmpp(
  creds: ChatAccountCreds,
  transport: ChatTransport,
): Promise<ChatSession> {
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
  const session = new XmppSession(creds.accountId, jid, stream, sm, transport);

  let resolveReady: () => void = () => undefined;
  let rejectReady: (e: Error) => void = () => undefined;
  const onErr = (e: unknown): void => rejectReady(e instanceof Error ? e : new Error(String(e)));

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
