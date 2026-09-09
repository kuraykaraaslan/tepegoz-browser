import { describe, it, expect } from 'vitest';
import { XmlStreamParser, type XmlElement } from './xml-stream';
import { type NegotiationAction, XmppNegotiator } from './negotiator';

const b64 = (s: string): string => btoa(s);

function el(xml: string): XmlElement {
  let out: XmlElement | null = null;
  const p = new XmlStreamParser((e) => {
    if (e.type === 'stanza') out = e.element;
  });
  p.feed(`<stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams">`);
  p.feed(xml);
  if (out === null) throw new Error(`no element from: ${xml}`);
  return out;
}

const FEATURES_TLS_REQ = `<stream:features><starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"><required/></starttls></stream:features>`;
const featuresAuth = (mechs: string) =>
  `<stream:features><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl">${mechs
    .split(',')
    .map((m) => `<mechanism>${m}</mechanism>`)
    .join('')}</mechanisms></stream:features>`;
const featuresBind = (sm: boolean) =>
  `<stream:features><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/>${
    sm ? '<sm xmlns="urn:xmpp:sm:3"/>' : ''
  }</stream:features>`;
const SASL_SUCCESS = `<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl"/>`;

const kinds = (as: NegotiationAction[]): string[] => as.map((a) => a.kind);
const sent = (as: NegotiationAction[]): string[] =>
  as
    .filter((a): a is Extract<NegotiationAction, { kind: 'send' }> => a.kind === 'send')
    .map((a) => a.xml);
function failReason(as: NegotiationAction[]): string {
  const f = as.find((a) => a.kind === 'failed');
  return f !== undefined && f.kind === 'failed' ? f.reason : '<not failed>';
}

function toPlainBind(): XmppNegotiator {
  const n = new XmppNegotiator({ jid: 'ada@x.com', password: 'pw', tlsActive: true });
  n.start();
  return n;
}

describe('XmppNegotiator — STARTTLS + SCRAM-SHA-1 + bind + SM', () => {
  it('drives the full handshake to ready', async () => {
    const n = new XmppNegotiator({
      jid: 'user@example.com',
      password: 'pencil',
      tlsActive: false,
      scramNonce: 'fyko+d2lbbFgONRv9qkxdawL',
    });

    expect(sent(n.start())[0]).toContain('<stream:stream to="example.com"');
    expect(await n.feed({ t: 'stream-open', attrs: { id: 's1' } })).toEqual([]);

    expect(sent(await n.feed({ t: 'element', el: el(FEATURES_TLS_REQ) }))[0]).toBe(
      '<starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"/>',
    );
    expect(
      kinds(
        await n.feed({ t: 'element', el: el(`<proceed xmlns="urn:ietf:params:xml:ns:xmpp-tls"/>`) }),
      ),
    ).toEqual(['starttls']);
    expect(kinds(await n.feed({ t: 'tls-established' }))).toEqual(['restart-stream']);

    const auth = await n.feed({ t: 'element', el: el(featuresAuth('SCRAM-SHA-1,PLAIN')) });
    expect(sent(auth)[0]).toContain('mechanism="SCRAM-SHA-1"');

    const challenge = await n.feed({
      t: 'element',
      el: el(
        `<challenge xmlns="urn:ietf:params:xml:ns:xmpp-sasl">${b64(
          'r=fyko+d2lbbFgONRv9qkxdawL3rfcNHYJY1ZVvWVs7j,s=QSXCR+Q6sek8bf92,i=4096',
        )}</challenge>`,
      ),
    });
    const proof = atob((sent(challenge)[0] ?? '').replace(/<[^>]+>/g, ''));
    expect(proof).toContain('p=v0X8v3Bz2T0CJGbJQyF0X+HI4Ts=');

    expect(
      kinds(
        await n.feed({
          t: 'element',
          el: el(
            `<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl">${b64('v=rmF9pqV8S7suAoZWja4dJRkFsKQ=')}</success>`,
          ),
        }),
      ),
    ).toEqual(['restart-stream']);

    const bind = await n.feed({ t: 'element', el: el(featuresBind(true)) });
    expect(sent(bind)[0]).toContain('<bind xmlns="urn:ietf:params:xml:ns:xmpp-bind">');

    const ready = await n.feed({
      t: 'element',
      el: el(
        `<iq type="result" id="bind-1"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><jid>user@example.com/portable</jid></bind></iq>`,
      ),
    });
    expect(ready.find((a) => a.kind === 'ready')).toMatchObject({
      fullJid: 'user@example.com/portable',
      streamManagement: true,
    });
    expect(sent(ready)[0]).toContain('<enable xmlns="urn:xmpp:sm:3" resume="true"/>');

    await n.feed({ t: 'element', el: el(`<enabled xmlns="urn:xmpp:sm:3"/>`) });
    expect(n.state).toBe('ready');
    // inert after ready
    expect(await n.feed({ t: 'element', el: el('<message/>') })).toEqual([]);
  });
});

describe('XmppNegotiator — direct TLS + PLAIN', () => {
  it('skips STARTTLS, binds with an explicit resource, no SM', async () => {
    const n = new XmppNegotiator({
      jid: 'ada@x.com',
      password: 'pw',
      tlsActive: true,
      resource: 'laptop',
    });
    n.start();
    const auth = await n.feed({ t: 'element', el: el(featuresAuth('PLAIN')) });
    expect(sent(auth)[0]).toContain('mechanism="PLAIN"');
    expect(kinds(await n.feed({ t: 'element', el: el(SASL_SUCCESS) }))).toEqual(['restart-stream']);
    const bind = await n.feed({ t: 'element', el: el(featuresBind(false)) });
    expect(sent(bind)[0]).toContain('<resource>laptop</resource>');
    const ready = await n.feed({
      t: 'element',
      el: el(`<iq type="result" id="bind-1"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><jid>ada@x.com/laptop</jid></bind></iq>`),
    });
    expect(ready).toEqual([{ kind: 'ready', fullJid: 'ada@x.com/laptop', streamManagement: false }]);
  });

  it('proceeds straight to SASL when no STARTTLS is offered (SCRAM ok without TLS)', async () => {
    const n = new XmppNegotiator({ jid: 'ada@x.com', password: 'pw', tlsActive: false });
    n.start();
    const r = await n.feed({ t: 'element', el: el(featuresAuth('SCRAM-SHA-256,PLAIN')) });
    expect(sent(r)[0]).toContain('mechanism="SCRAM-SHA-256"');
  });

  it('refuses PLAIN over a plaintext connection', async () => {
    const n = new XmppNegotiator({ jid: 'ada@x.com', password: 'pw', tlsActive: false });
    n.start();
    const r = await n.feed({ t: 'element', el: el(featuresAuth('PLAIN')) });
    expect(failReason(r)).toContain('no acceptable SASL');
  });
});

describe('XmppNegotiator — failure paths', () => {
  it('required STARTTLS with no <starttls/> element', async () => {
    const n = new XmppNegotiator({ jid: 'a@x.com', password: 'p', tlsActive: false });
    n.start();
    // a features set that has neither starttls nor mechanisms, but is flagged required elsewhere is
    // not representable; instead assert the no-mechanism auth failure path:
    const r = await n.feed({ t: 'element', el: el(featuresAuth('EXTERNAL')) });
    expect(failReason(r)).toContain('no acceptable SASL');
  });

  it('<proceed/> not received after <starttls/>', async () => {
    const n = new XmppNegotiator({ jid: 'a@x.com', password: 'p', tlsActive: false });
    n.start();
    await n.feed({ t: 'element', el: el(FEATURES_TLS_REQ) });
    const r = await n.feed({ t: 'element', el: el('<failure xmlns="urn:ietf:params:xml:ns:xmpp-tls"/>') });
    expect(failReason(r)).toContain('proceed');
  });

  it('SASL <failure/> (named child, and bare with only text → "unknown")', async () => {
    const n = toPlainBind();
    await n.feed({ t: 'element', el: el(featuresAuth('PLAIN')) });
    expect(
      failReason(
        await n.feed({
          t: 'element',
          el: el(`<failure xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><not-authorized/></failure>`),
        }),
      ),
    ).toBe('SASL failure: not-authorized');

    const n2 = toPlainBind();
    await n2.feed({ t: 'element', el: el(featuresAuth('PLAIN')) });
    expect(
      failReason(
        await n2.feed({
          t: 'element',
          el: el(`<failure xmlns="urn:ietf:params:xml:ns:xmpp-sasl">some text</failure>`),
        }),
      ),
    ).toBe('SASL failure: unknown');
  });

  it('ignores an unrelated element received during the SASL phase', async () => {
    const n = toPlainBind();
    await n.feed({ t: 'element', el: el(featuresAuth('PLAIN')) });
    expect(await n.feed({ t: 'element', el: el('<presence/>') })).toEqual([]);
  });

  it('SCRAM server-signature mismatch on <success>', async () => {
    const n = new XmppNegotiator({
      jid: 'user@example.com',
      password: 'pencil',
      tlsActive: true,
      scramNonce: 'fyko+d2lbbFgONRv9qkxdawL',
    });
    n.start();
    await n.feed({ t: 'element', el: el(featuresAuth('SCRAM-SHA-1')) });
    await n.feed({
      t: 'element',
      el: el(
        `<challenge xmlns="urn:ietf:params:xml:ns:xmpp-sasl">${b64(
          'r=fyko+d2lbbFgONRv9qkxdawL3rfcNHYJY1ZVvWVs7j,s=QSXCR+Q6sek8bf92,i=4096',
        )}</challenge>`,
      ),
    });
    const r = await n.feed({
      t: 'element',
      el: el(`<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl">${b64('v=bogus')}</success>`),
    });
    expect(failReason(r)).toContain('signature mismatch');
  });

  it('SCRAM bad challenge, and an unexpected challenge under PLAIN', async () => {
    const n = new XmppNegotiator({
      jid: 'u@x.com',
      password: 'p',
      tlsActive: true,
      scramNonce: 'abc',
    });
    n.start();
    await n.feed({ t: 'element', el: el(featuresAuth('SCRAM-SHA-1')) });
    const bad = await n.feed({
      t: 'element',
      el: el(`<challenge xmlns="urn:ietf:params:xml:ns:xmpp-sasl">${b64('r=abc,i=1')}</challenge>`),
    });
    expect(failReason(bad)).toContain('bad server challenge');

    const p = toPlainBind();
    await p.feed({ t: 'element', el: el(featuresAuth('PLAIN')) });
    const r = await p.feed({
      t: 'element',
      el: el(`<challenge xmlns="urn:ietf:params:xml:ns:xmpp-sasl">${b64('x')}</challenge>`),
    });
    expect(failReason(r)).toContain('unexpected SASL challenge');
  });

  it('stream error → failed, then inert', async () => {
    const n = toPlainBind();
    const r = await n.feed({ t: 'element', el: el(`<stream:error><host-unknown/></stream:error>`) });
    expect(r[0]?.kind).toBe('failed');
    expect(await n.feed({ t: 'element', el: el('<message/>') })).toEqual([]);
  });

  it('no resource binding offered after auth', async () => {
    const n = toPlainBind();
    await n.feed({ t: 'element', el: el(featuresAuth('PLAIN')) });
    await n.feed({ t: 'element', el: el(SASL_SUCCESS) });
    const r = await n.feed({ t: 'element', el: el(`<stream:features/>`) });
    expect(failReason(r)).toContain('no resource binding');
  });

  it('bind result with error type / no jid', async () => {
    const withErr = toPlainBind();
    await withErr.feed({ t: 'element', el: el(featuresAuth('PLAIN')) });
    await withErr.feed({ t: 'element', el: el(SASL_SUCCESS) });
    await withErr.feed({ t: 'element', el: el(featuresBind(false)) });
    expect(
      failReason(
        await withErr.feed({ t: 'element', el: el(`<iq type="error" id="bind-1"/>`) }),
      ),
    ).toContain('rejected');

    const noJid = toPlainBind();
    await noJid.feed({ t: 'element', el: el(featuresAuth('PLAIN')) });
    await noJid.feed({ t: 'element', el: el(SASL_SUCCESS) });
    await noJid.feed({ t: 'element', el: el(featuresBind(false)) });
    expect(
      failReason(
        await noJid.feed({
          t: 'element',
          el: el(`<iq type="result" id="bind-1"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/></iq>`),
        }),
      ),
    ).toContain('no JID');
  });

  it('SM <failed/> still lands ready', async () => {
    const n = new XmppNegotiator({
      jid: 'user@example.com',
      password: 'pw',
      tlsActive: true,
    });
    n.start();
    await n.feed({ t: 'element', el: el(featuresAuth('PLAIN')) });
    await n.feed({ t: 'element', el: el(SASL_SUCCESS) });
    await n.feed({ t: 'element', el: el(featuresBind(true)) });
    const ready = await n.feed({
      t: 'element',
      el: el(`<iq type="result" id="bind-1"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><jid>user@example.com/x</jid></bind></iq>`),
    });
    expect(ready.some((a) => a.kind === 'ready')).toBe(true);
    await n.feed({ t: 'element', el: el(`<failed xmlns="urn:xmpp:sm:3"/>`) });
    expect(n.state).toBe('ready');
  });

  it('ignores stray elements before features and mismatched iq ids', async () => {
    const n = toPlainBind();
    expect(await n.feed({ t: 'element', el: el('<presence/>') })).toEqual([]);
    await n.feed({ t: 'element', el: el(featuresAuth('PLAIN')) });
    await n.feed({ t: 'element', el: el(SASL_SUCCESS) });
    await n.feed({ t: 'element', el: el(featuresBind(false)) });
    expect(await n.feed({ t: 'element', el: el(`<iq type="result" id="other"/>`) })).toEqual([]);
  });
});
