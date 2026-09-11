import { formatIrcLine, type IrcMessage } from './parse';
import { saslExternal, saslPlain } from '../xmpp/sasl';

/**
 * IRC connection registration — a pure state machine (mirrors `xmpp/negotiator.ts`). It drives
 * IRCv3 `CAP` negotiation, optional SASL PLAIN, the `NICK` / `USER` / `PASS` handshake and the
 * `433 ERR_NICKNAMEINUSE` retry, then reports `registered` on `001 RPL_WELCOME`.
 *
 * The caller owns the socket: it feeds every parsed inbound line and writes every `send` action.
 */

/** Client caps we ask for — the server's `CAP LS` list narrows this to what it actually offers. */
export const IRC_WANTED_CAPS = [
  'message-tags',
  'server-time',
  'account-tag',
  'account-notify',
  'echo-message',
  'batch',
  'labeled-response',
  'multi-prefix',
  'away-notify',
  'extended-join',
  'chghost',
  'setname',
  'sasl',
  // Both names requested — servers still on the unfinalised spec advertise `draft/chathistory`
  // (ergo, as of this writing), finalised servers advertise `chathistory`; `IrcAdapter.history()`
  // already checks for either in the ACKed set.
  'chathistory',
  'draft/chathistory',
] as const;

/**
 * SASL config for registration. Requires the server to advertise the `sasl` cap.
 * - `PLAIN` — nick + secret over the (guaranteed-TLS) stream.
 * - `EXTERNAL` — no secret; the identity is the TLS client certificate (CertFP). The transport is
 *   responsible for presenting the cert; this state machine only drives the `AUTHENTICATE` exchange.
 */
export type IrcSaslConfig =
  | { mechanism: 'PLAIN'; username: string; password: string }
  | { mechanism: 'EXTERNAL'; authzid?: string };

export interface RegistrationConfig {
  nick: string;
  user?: string;
  realname?: string;
  /** Server password (`PASS`), sent before `NICK`/`USER`. */
  password?: string;
  sasl?: IrcSaslConfig;
}

export type RegistrationAction =
  | { kind: 'send'; line: string }
  | { kind: 'registered'; nick: string }
  | { kind: 'failed'; reason: string };

type Phase =
  | 'idle'
  | 'cap-ls'
  | 'sasl-auth'
  | 'sasl-wait'
  | 'cap-end-wait'
  | 'registered'
  | 'failed';

export class IrcRegistration {
  private phase: Phase = 'idle';
  private nick: string;
  private nickAttempt = 0;
  private acked = new Set<string>();
  private capBuffer = '';

  constructor(private readonly cfg: RegistrationConfig) {
    this.nick = cfg.nick;
  }

  get currentNick(): string {
    return this.nick;
  }

  /** The IRCv3 caps the server ACKed (available once `registered`). */
  get ackedCaps(): ReadonlySet<string> {
    return this.acked;
  }

  start(): RegistrationAction[] {
    this.phase = 'cap-ls';
    const out: RegistrationAction[] = [{ kind: 'send', line: 'CAP LS 302' }];
    if (this.cfg.password !== undefined && this.cfg.password.length > 0) {
      out.push({ kind: 'send', line: formatIrcLine('PASS', [this.cfg.password]) });
    }
    out.push(
      { kind: 'send', line: formatIrcLine('NICK', [this.nick]) },
      {
        kind: 'send',
        line: formatIrcLine('USER', [
          this.cfg.user ?? this.nick,
          '0',
          '*',
          this.cfg.realname ?? this.nick,
        ]),
      },
    );
    return out;
  }

  feed(msg: IrcMessage): RegistrationAction[] {
    if (this.phase === 'registered' || this.phase === 'failed') return [];

    switch (msg.command) {
      case 'CAP':
        return this.onCap(msg);
      case 'AUTHENTICATE':
        return this.onAuthenticate(msg);
      case '900': // RPL_LOGGEDIN
      case '903': // RPL_SASLSUCCESS
        return this.afterSasl();
      case '902': // ERR_NICKLOCKED
      case '904': // ERR_SASLFAIL
      case '905': // ERR_SASLTOOLONG
      case '906': // ERR_SASLABORTED
        return this.fail('SASL authentication failed');
      case '433': // ERR_NICKNAMEINUSE
        return this.retryNick();
      case '001': // RPL_WELCOME
        this.phase = 'registered';
        this.nick = msg.params[0] ?? this.nick;
        return [{ kind: 'registered', nick: this.nick }];
      case 'ERROR':
        return this.fail(msg.params[0] ?? 'server closed the connection');
      default:
        return [];
    }
  }

  private onCap(msg: IrcMessage): RegistrationAction[] {
    // params: <nick> <subcommand> [*] <caps>
    const sub = msg.params[1];
    const hasMore = msg.params[2] === '*';
    const list = (hasMore ? msg.params[3] : msg.params[2]) ?? '';

    if (sub === 'LS') {
      this.capBuffer += (this.capBuffer.length > 0 ? ' ' : '') + list;
      if (hasMore) return [];
      const offered = new Set(this.capBuffer.split(/\s+/).map((c) => c.split('=')[0] ?? c));
      const want = IRC_WANTED_CAPS.filter((c) => offered.has(c));
      if (want.length === 0) return this.endCap();
      return [{ kind: 'send', line: `CAP REQ :${want.join(' ')}` }];
    }

    if (sub === 'ACK') {
      for (const c of list.split(/\s+/)) if (c.length > 0) this.acked.add(c);
      if (this.acked.has('sasl') && this.cfg.sasl !== undefined) {
        this.phase = 'sasl-auth';
        return [{ kind: 'send', line: `AUTHENTICATE ${this.cfg.sasl.mechanism}` }];
      }
      return this.endCap();
    }

    if (sub === 'NAK') return this.endCap();
    return [];
  }

  private onAuthenticate(msg: IrcMessage): RegistrationAction[] {
    if (this.phase !== 'sasl-auth' || this.cfg.sasl === undefined) return [];
    if (msg.params[0] !== '+') return [];
    this.phase = 'sasl-wait';
    const sasl = this.cfg.sasl;
    const payload =
      sasl.mechanism === 'EXTERNAL'
        ? saslExternal(sasl.authzid ?? '')
        : saslPlain(sasl.username, sasl.password);
    return [{ kind: 'send', line: `AUTHENTICATE ${payload}` }];
  }

  private afterSasl(): RegistrationAction[] {
    if (this.phase === 'sasl-wait' || this.phase === 'sasl-auth') return this.endCap();
    return [];
  }

  private endCap(): RegistrationAction[] {
    if (this.phase === 'cap-end-wait' || this.phase === 'registered') return [];
    this.phase = 'cap-end-wait';
    return [{ kind: 'send', line: 'CAP END' }];
  }

  private retryNick(): RegistrationAction[] {
    this.nickAttempt += 1;
    if (this.nickAttempt > 3) return this.fail('nickname unavailable');
    this.nick = `${this.cfg.nick}${'_'.repeat(this.nickAttempt)}`;
    return [{ kind: 'send', line: formatIrcLine('NICK', [this.nick]) }];
  }

  private fail(reason: string): RegistrationAction[] {
    this.phase = 'failed';
    return [{ kind: 'failed', reason }];
  }
}
