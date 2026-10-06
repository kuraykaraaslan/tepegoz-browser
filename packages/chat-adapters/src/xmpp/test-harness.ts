import type { ChatAccountCreds } from '../adapter';
import type {
  ChatFetchInit,
  ChatFetchResponse,
  ChatTransport,
  DuplexStream,
  OpenTcpOptions,
} from '../transport';
import { XmppAdapter, type XmppSession } from './adapter';

/**
 * A scripted fake XMPP server over the injected transport. The client's writes land in `written`;
 * the test pushes server bytes with `send()`. No sockets, no timers.
 */
export class FakeServer implements ChatTransport {
  written: string[] = [];
  private onData: ((chunk: Uint8Array) => void) | null = null;
  private onClose: ((err?: Error) => void) | null = null;
  private stream: DuplexStream;
  tlsUpgraded = false;

  constructor() {
    this.stream = {
      write: (data) => {
        this.written.push(typeof data === 'string' ? data : new TextDecoder().decode(data));
      },
      onData: (cb) => {
        this.onData = cb;
      },
      onClose: (cb) => {
        this.onClose = cb;
      },
      close: () => this.onClose?.(),
    };
  }

  tcpOpts: OpenTcpOptions | null = null;
  openTCP(opts?: OpenTcpOptions): Promise<DuplexStream> {
    this.tcpOpts = opts ?? null;
    return Promise.resolve(this.stream);
  }
  upgradeTLS(s: DuplexStream): Promise<DuplexStream> {
    this.tlsUpgraded = true;
    return Promise.resolve(s);
  }
  openWebSocket(): Promise<DuplexStream> {
    return Promise.resolve(this.stream);
  }
  fetchCalls: { url: string; init?: ChatFetchInit }[] = [];
  /** Tests override this to script a response; defaults to rejecting like every other unused seam
   *  on this fake. */
  fetchImpl: (url: string, init?: ChatFetchInit) => Promise<ChatFetchResponse> = () =>
    Promise.reject(new Error('nope'));
  fetch(url: string, init?: ChatFetchInit): Promise<ChatFetchResponse> {
    this.fetchCalls.push(init === undefined ? { url } : { url, init });
    return this.fetchImpl(url, init);
  }
  openEventStream(): Promise<never> {
    return Promise.reject(new Error('nope'));
  }

  /** Deliver bytes to the client parser. */
  send(xml: string): void {
    this.onData?.(new TextEncoder().encode(xml));
  }

  lastWritten(): string {
    return this.written.at(-1) ?? '';
  }

  drop(): void {
    this.onClose?.(new Error('connection reset'));
  }
}

export const creds = (overrides: Partial<ChatAccountCreds['server']> = {}): ChatAccountCreds => ({
  accountId: 'acc',
  secret: 'pencil',
  server: {
    protocol: 'xmpp',
    jid: 'ada@example.com',
    host: null,
    port: null,
    security: 'tls',
    wsUrl: null,
    ...overrides,
  } as ChatAccountCreds['server'],
});

export const FEAT_AUTH = `<stream:features><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>PLAIN</mechanism></mechanisms></stream:features>`;
export const FEAT_BIND = `<stream:features><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/><sm xmlns="urn:xmpp:sm:3"/></stream:features>`;

/** Run the scripted handshake against a fresh adapter+server, returning both. */
export async function connected(): Promise<{
  adapter: XmppAdapter;
  server: FakeServer;
  session: XmppSession;
}> {
  const server = new FakeServer();
  const adapter = new XmppAdapter();
  const connectP = adapter.connect(creds(), server);

  // client -> <stream:stream>
  await tick();
  server.send(
    `<stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" id="s1">`,
  );
  server.send(FEAT_AUTH);
  await tick();
  expectLastWrittenToContain(server, 'mechanism="PLAIN"');

  server.send(`<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl"/>`);
  await tick();
  server.send(
    `<stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" id="s2">`,
  );
  server.send(FEAT_BIND);
  await tick();
  expectLastWrittenToContain(server, '<bind xmlns="urn:ietf:params:xml:ns:xmpp-bind">');

  server.send(
    `<iq type="result" id="bind-1"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><jid>ada@example.com/tepegoz</jid></bind></iq>`,
  );
  server.send(`<enabled xmlns="urn:xmpp:sm:3" id="sm-1" resume="true"/>`);

  const session = (await connectP) as XmppSession;
  return { adapter, server, session };
}

export const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Handshake guard — throws (failing the calling test) when the client's last write is not the expected step.
 *  A plain throw, not vitest's `expect`, so this non-test module stays free of the dev-dependency. */
function expectLastWrittenToContain(server: FakeServer, needle: string): void {
  if (!server.lastWritten().includes(needle)) {
    throw new Error(
      `expected the last client write to contain ${needle}, got ${server.lastWritten()}`,
    );
  }
}
