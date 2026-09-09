import { type XmlElement } from './xml-stream';

/**
 * XEP-0198 Stream Management — the h-counting + acknowledgement + resumption bookkeeping, as a pure
 * state object. The adapter drives it: count each inbound stanza, answer `<r/>` with `<a/>`, request
 * acks for our own sends, and on a dropped connection attempt `<resume/>` to replay the unacked tail
 * instead of losing messages.
 *
 * `h` is a 32-bit unsigned counter that wraps at 2^32 (per the XEP). The outbound replay queue is
 * capped — a server that never acks cannot make us buffer without bound; past the cap the oldest
 * unacked stanzas are dropped and `overflowed` is set so the adapter can surface a reliability
 * warning.
 */

const NS_SM = 'urn:xmpp:sm:3';
const H_MODULO = 0x1_0000_0000;
const DEFAULT_MAX_QUEUE = 1000;

interface OutboundEntry {
  seq: number;
  xml: string;
}

export interface StreamManagerOptions {
  maxQueue?: number;
}

export class StreamManager {
  /** Count of inbound stanzas we have handled (what we report in `<a h=…/>`). */
  private inbound = 0;
  /** Count of outbound stanzas we have sent (the seq of the last queued entry). */
  private outbound = 0;
  private queue: OutboundEntry[] = [];
  private enabled = false;
  private resumeId: string | null = null;
  private serverMax: number | null = null;
  private readonly maxQueue: number;
  /** Set once the queue has had to drop unacked stanzas — an unreliable link. */
  overflowed = false;

  constructor(opts: StreamManagerOptions = {}) {
    this.maxQueue = Math.max(16, opts.maxQueue ?? DEFAULT_MAX_QUEUE);
  }

  /** `<enable/>` we send when SM is offered (the negotiator already emits this). */
  static enableXml(resume = true): string {
    return `<enable xmlns="${NS_SM}" resume="${resume ? 'true' : 'false'}"/>`;
  }

  /** Consume the server's `<enabled/>`. */
  onEnabled(el: XmlElement): void {
    if (el.local !== 'enabled' || el.ns !== NS_SM) return;
    this.enabled = true;
    this.resumeId = el.attrs.id ?? null;
    const max = Number.parseInt(el.attrs.max ?? '', 10);
    this.serverMax = Number.isFinite(max) && max > 0 ? max : null;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get canResume(): boolean {
    return this.enabled && this.resumeId !== null;
  }

  get previd(): string | null {
    return this.resumeId;
  }

  /** Server-advertised max resumption seconds, if any. */
  get resumptionWindowSeconds(): number | null {
    return this.serverMax;
  }

  get inboundCount(): number {
    return this.inbound;
  }

  get unackedCount(): number {
    return this.queue.length;
  }

  /** Count one handled inbound stanza. Nonzas (`<r/>`, `<a/>`, stream errors) are NOT stanzas — the
   *  caller must only invoke this for `<message/>` / `<presence/>` / `<iq/>`. */
  countInbound(): void {
    this.inbound = (this.inbound + 1) % H_MODULO;
  }

  /** Track an outbound stanza so it can be replayed if the server never acks it. */
  trackOutbound(xml: string): void {
    this.outbound = (this.outbound + 1) % H_MODULO;
    this.queue.push({ seq: this.outbound, xml });
    if (this.queue.length > this.maxQueue) {
      this.queue.splice(0, this.queue.length - this.maxQueue);
      this.overflowed = true;
    }
  }

  /** The `<a/>` answer to a server `<r/>`. */
  ackAnswerXml(): string {
    return `<a xmlns="${NS_SM}" h="${this.inbound}"/>`;
  }

  /** Our own `<r/>` ack request. */
  static requestXml(): string {
    return `<r xmlns="${NS_SM}"/>`;
  }

  /** Consume a server `<a h=…/>` — drop everything the server confirms it received. Returns the
   *  number of stanzas dropped. */
  onAck(el: XmlElement): number {
    if (el.local !== 'a' || el.ns !== NS_SM) return 0;
    const h = Number.parseInt(el.attrs.h ?? '', 10);
    if (!Number.isFinite(h) || h < 0) return 0;
    return this.dropUpTo(h);
  }

  private dropUpTo(h: number): number {
    const before = this.queue.length;
    // Account for wrap: an entry seq is "acked" if it is <= h in modular terms within a window.
    this.queue = this.queue.filter((e) => !seqLteMod(e.seq, h));
    return before - this.queue.length;
  }

  /** `<resume/>` for a reconnect. Only valid when {@link canResume}. */
  resumeXml(): string | null {
    if (!this.canResume) return null;
    return `<resume xmlns="${NS_SM}" h="${this.inbound}" previd="${this.resumeId ?? ''}"/>`;
  }

  /**
   * Consume `<resumed h=…/>` — the server acked our outbound up to `h`; the remaining queue is what
   * must be re-sent (in order). Returns those stanzas.
   */
  onResumed(el: XmlElement): string[] {
    if (el.local !== 'resumed' || el.ns !== NS_SM) return [];
    const h = Number.parseInt(el.attrs.h ?? '', 10);
    if (Number.isFinite(h) && h >= 0) this.dropUpTo(h);
    return this.queue.map((e) => e.xml);
  }

  /** Consume `<failed/>` — resumption is impossible; the caller must open a fresh session. */
  onFailed(el: XmlElement): void {
    if (el.local === 'failed' && el.ns === NS_SM) {
      this.enabled = false;
      this.resumeId = null;
    }
  }

  /** Reset counters for a brand-new (non-resumed) session, keeping nothing. */
  reset(): void {
    this.inbound = 0;
    this.outbound = 0;
    this.queue = [];
    this.enabled = false;
    this.resumeId = null;
    this.serverMax = null;
    this.overflowed = false;
  }
}

/** `a <= b` in 32-bit modular arithmetic, treating a half-range as "before". */
function seqLteMod(a: number, b: number): boolean {
  const diff = (b - a + H_MODULO) % H_MODULO;
  return diff < H_MODULO / 2;
}
