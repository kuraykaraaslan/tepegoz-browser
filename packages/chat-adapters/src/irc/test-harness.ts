import type { ChatServerConfig } from '@tepegoz/shared-types';
import type { ChatAccountCreds } from '../adapter';
import type { ChatTransport, DuplexStream, OpenTcpOptions } from '../transport';
import { IrcAdapter, type IrcSession } from './adapter';

export type IrcServer = Extract<ChatServerConfig, { protocol: 'irc' }>;

export const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export class FakeServer implements ChatTransport {
  written: string[] = [];
  private onData: ((c: Uint8Array) => void) | null = null;
  private onClose: ((e?: Error) => void) | null = null;
  lastOpen: OpenTcpOptions | null = null;

  private closeStub: (() => void) | null = null;
  private stream: DuplexStream = {
    write: (d) => {
      const text = typeof d === 'string' ? d : new TextDecoder().decode(d);
      for (const line of text.split('\r\n')) if (line.length > 0) this.written.push(line);
    },
    onData: (cb) => {
      this.onData = cb;
    },
    onClose: (cb) => {
      this.onClose = cb;
    },
    close: () => {
      if (this.closeStub !== null) this.closeStub();
      else this.onClose?.();
    },
  };

  stub(fn: () => void): void {
    this.closeStub = fn;
  }

  openTCP(opts: OpenTcpOptions): Promise<DuplexStream> {
    this.lastOpen = opts;
    return Promise.resolve(this.stream);
  }
  upgradeTLS(): Promise<DuplexStream> {
    return Promise.resolve(this.stream);
  }
  openWebSocket(): Promise<DuplexStream> {
    throw new Error('unused');
  }
  fetch(): never {
    throw new Error('unused');
  }
  openEventStream(): never {
    throw new Error('unused');
  }

  send(...lines: string[]): void {
    this.onData?.(new TextEncoder().encode(lines.map((l) => `${l}\r\n`).join('')));
  }
  drop(): void {
    this.onClose?.();
  }
  lastWritten(): string {
    return this.written.at(-1) ?? '';
  }
}

export const creds = (over: Partial<IrcServer> = {}): ChatAccountCreds => ({
  accountId: 'acc',
  secret: 'pw',
  server: {
    protocol: 'irc',
    server: 'irc.example',
    port: 6697,
    tls: true,
    nick: 'ada',
    sasl: false,
    ...over,
  },
});

export async function connected(server = new FakeServer()) {
  const adapter = new IrcAdapter();
  const p = adapter.connect(creds(), server);
  await tick();
  // the client sent CAP LS + NICK + USER (+ PASS since a secret is set and sasl is off)
  server.send('CAP * LS :message-tags server-time');
  server.send('CAP ada ACK :message-tags server-time');
  server.send(':irc.example 001 ada :Welcome ada');
  const session = (await p) as IrcSession;
  return { adapter, server, session };
}
