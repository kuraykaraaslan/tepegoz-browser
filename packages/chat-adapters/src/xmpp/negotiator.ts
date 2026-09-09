import { parseJid } from '@tepegoz/chat-core';
import { parseStreamFeatures, pickSaslMechanism } from './features';
import {
  type ScramState,
  saslPlain,
  scramClientFirst,
  scramFinal,
  scramVerify,
  startScram,
} from './sasl';
import { encodeXmlText, type XmlElement, child, text } from './xml-stream';

/**
 * The XMPP stream-negotiation state machine (RFC 6120 §4–§7), as a **pure, IO-free orchestrator**.
 * It consumes parser events and emits `NegotiationAction`s the adapter carries out (send bytes,
 * upgrade the socket to TLS, restart the XML stream). SCRAM makes `feed` async; everything else is
 * synchronous.
 *
 * Scope for X-chat.1: STARTTLS or direct-TLS, SASL (SCRAM-SHA-1/256 or PLAIN), resource binding,
 * and enabling XEP-0198 stream management (h-counting + resumption live in `stream-management.ts`).
 */

const NS_TLS = 'urn:ietf:params:xml:ns:xmpp-tls';
const NS_SASL = 'urn:ietf:params:xml:ns:xmpp-sasl';
const NS_BIND = 'urn:ietf:params:xml:ns:xmpp-bind';
const NS_SM = 'urn:xmpp:sm:3';

export interface NegotiatorConfig {
  /** Bare JID `user@domain`. */
  jid: string;
  password: string;
  /** Desired resource; the server may override. Empty → server-assigned. */
  resource?: string;
  /** True when the socket is already TLS (a direct-TLS port), so STARTTLS is skipped. */
  tlsActive: boolean;
  /** Test seam: pin the SCRAM client nonce for a deterministic exchange. Never set in production. */
  scramNonce?: string;
}

export type NegotiationAction =
  | { kind: 'send'; xml: string }
  | { kind: 'starttls' }
  | { kind: 'restart-stream'; xml: string }
  | { kind: 'ready'; fullJid: string; streamManagement: boolean }
  | { kind: 'failed'; reason: string };

export type NegotiatorInput =
  | { t: 'stream-open'; attrs: Record<string, string> }
  | { t: 'element'; el: XmlElement }
  | { t: 'tls-established' };

type Phase =
  | 'idle'
  | 'await-features-pre-tls'
  | 'await-proceed'
  | 'await-features-pre-auth'
  | 'await-sasl'
  | 'await-features-post-auth'
  | 'await-bind'
  | 'await-sm'
  | 'ready'
  | 'failed';

export class XmppNegotiator {
  private phase: Phase = 'idle';
  private readonly domain: string;
  private readonly bindId = 'bind-1';
  private scram: ScramState | null = null;
  private scramServerSig: string | null = null;
  private smOffered = false;
  /** Tracks whether the transport is TLS *now* — starts at the config value, flips true once
   *  STARTTLS completes, so PLAIN is never chosen before the link is encrypted. */
  private tlsActive: boolean;

  constructor(private readonly cfg: NegotiatorConfig) {
    this.domain = parseJid(cfg.jid)?.domain ?? '';
    this.tlsActive = cfg.tlsActive;
  }

  /** The opening `<stream:stream>` — the adapter sends this right after the socket connects. */
  start(): NegotiationAction[] {
    this.phase = this.tlsActive ? 'await-features-pre-auth' : 'await-features-pre-tls';
    return [{ kind: 'send', xml: this.openStreamXml() }];
  }

  private openStreamXml(): string {
    return (
      `<?xml version="1.0"?>` +
      `<stream:stream to="${encodeXmlText(this.domain)}" version="1.0" ` +
      `xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams">`
    );
  }

  private fail(reason: string): NegotiationAction[] {
    this.phase = 'failed';
    return [{ kind: 'failed', reason }];
  }

  async feed(input: NegotiatorInput): Promise<NegotiationAction[]> {
    if (this.phase === 'failed' || this.phase === 'ready') return [];
    if (input.t === 'stream-open') return [];
    if (input.t === 'tls-established') {
      this.tlsActive = true;
      this.phase = 'await-features-pre-auth';
      return [{ kind: 'restart-stream', xml: this.openStreamXml() }];
    }
    return this.onElement(input.el);
  }

  private async onElement(el: XmlElement): Promise<NegotiationAction[]> {
    if (el.local === 'error' && el.name.startsWith('stream:')) {
      return this.fail(`stream error: ${firstChildName(el)}`);
    }

    switch (this.phase) {
      case 'await-features-pre-tls':
        return this.handlePreTlsFeatures(el);
      case 'await-proceed':
        if (el.local === 'proceed' && el.ns === NS_TLS) {
          this.phase = 'await-features-pre-auth';
          return [{ kind: 'starttls' }];
        }
        return this.fail('expected <proceed/> after <starttls/>');
      case 'await-features-pre-auth':
        return this.handlePreAuthFeatures(el);
      case 'await-sasl':
        return this.handleSasl(el);
      case 'await-features-post-auth':
        return this.handlePostAuthFeatures(el);
      case 'await-bind':
        return this.handleBindResult(el);
      case 'await-sm':
        return this.handleSmResult(el);
      default:
        return [];
    }
  }

  private handlePreTlsFeatures(el: XmlElement): NegotiationAction[] {
    if (el.local !== 'features') return [];
    const f = parseStreamFeatures(el);
    if (f.startTls) {
      this.phase = 'await-proceed';
      return [{ kind: 'send', xml: `<starttls xmlns="${NS_TLS}"/>` }];
    }
    if (f.startTlsRequired) return this.fail('server requires STARTTLS but offers none');
    // No TLS offered — proceed to auth (a plaintext dev server).
    return this.handlePreAuthFeatures(el);
  }

  private handlePreAuthFeatures(el: XmlElement): NegotiationAction[] {
    if (el.local !== 'features') return [];
    const f = parseStreamFeatures(el);
    const mech = pickSaslMechanism(f.mechanisms, { tlsActive: this.tlsActive });
    if (mech === null) return this.fail(`no acceptable SASL mechanism in [${f.mechanisms.join(', ')}]`);

    this.phase = 'await-sasl';
    const bare = parseJid(this.cfg.jid);
    const localpart = bare?.local ?? this.cfg.jid;

    if (mech === 'PLAIN') {
      const payload = saslPlain(localpart, this.cfg.password);
      return [{ kind: 'send', xml: `<auth xmlns="${NS_SASL}" mechanism="PLAIN">${payload}</auth>` }];
    }
    const state =
      this.cfg.scramNonce !== undefined
        ? startScram(mech, localpart, this.cfg.password, this.cfg.scramNonce)
        : startScram(mech, localpart, this.cfg.password);
    if (state === null) return this.fail(`cannot start ${mech}`);
    this.scram = state;
    return [
      {
        kind: 'send',
        xml: `<auth xmlns="${NS_SASL}" mechanism="${mech}">${scramClientFirst(state)}</auth>`,
      },
    ];
  }

  private async handleSasl(el: XmlElement): Promise<NegotiationAction[]> {
    if (el.local === 'failure' && el.ns === NS_SASL) {
      return this.fail(`SASL failure: ${firstChildName(el)}`);
    }
    if (el.local === 'challenge' && el.ns === NS_SASL) {
      if (this.scram === null) return this.fail('unexpected SASL challenge');
      const result = await scramFinal(this.scram, text(el).trim());
      if (result === null) return this.fail('SCRAM: bad server challenge');
      this.scramServerSig = result.expectedServerSignature;
      return [{ kind: 'send', xml: `<response xmlns="${NS_SASL}">${result.response}</response>` }];
    }
    if (el.local === 'success' && el.ns === NS_SASL) {
      if (this.scram !== null && this.scramServerSig !== null) {
        const body = text(el).trim();
        if (body.length > 0 && !scramVerify(body, this.scramServerSig)) {
          return this.fail('SCRAM: server signature mismatch');
        }
      }
      this.phase = 'await-features-post-auth';
      return [{ kind: 'restart-stream', xml: this.openStreamXml() }];
    }
    return [];
  }

  private handlePostAuthFeatures(el: XmlElement): NegotiationAction[] {
    if (el.local !== 'features') return [];
    const f = parseStreamFeatures(el);
    if (!f.bind) return this.fail('server offered no resource binding after auth');
    this.smOffered = f.streamManagement;
    this.phase = 'await-bind';
    const res =
      this.cfg.resource !== undefined && this.cfg.resource.length > 0
        ? `<resource>${encodeXmlText(this.cfg.resource)}</resource>`
        : '';
    return [
      {
        kind: 'send',
        xml:
          `<iq type="set" id="${this.bindId}"><bind xmlns="${NS_BIND}">${res}</bind></iq>`,
      },
    ];
  }

  private handleBindResult(el: XmlElement): NegotiationAction[] {
    if (el.local !== 'iq' || el.attrs.id !== this.bindId) return [];
    if (el.attrs.type === 'error') return this.fail('resource bind rejected');
    const bind = child(el, 'bind', NS_BIND);
    const fullJid = bind === null ? '' : text(child(bind, 'jid') ?? bind).trim();
    if (fullJid.length === 0) return this.fail('bind result carried no JID');

    if (this.smOffered) {
      this.phase = 'await-sm';
      return [
        { kind: 'ready', fullJid, streamManagement: true },
        { kind: 'send', xml: `<enable xmlns="${NS_SM}" resume="true"/>` },
      ];
    }
    this.phase = 'ready';
    return [{ kind: 'ready', fullJid, streamManagement: false }];
  }

  private handleSmResult(el: XmlElement): NegotiationAction[] {
    // 'enabled' / 'failed' are informational at this point — the connection is already usable.
    if (el.ns === NS_SM && (el.local === 'enabled' || el.local === 'failed')) {
      this.phase = 'ready';
    }
    return [];
  }

  get state(): Phase {
    return this.phase;
  }
}

function firstChildName(el: XmlElement): string {
  for (const c of el.children) {
    if (typeof c !== 'string') return c.local;
  }
  return 'unknown';
}
