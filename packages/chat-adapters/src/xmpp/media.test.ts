import { describe, it, expect } from 'vitest';
import { XmppAdapter, type XmppSession } from './adapter';
import { FakeServer, connected, tick } from './test-harness';

describe('XmppAdapter — media', () => {
  describe('uploadMedia / resolveMedia (XEP-0363)', () => {
    /** Extracts the id of the last-written iq and sends `xml` (with `${id}` already substituted). */
    function lastIqId(server: FakeServer): string {
      return /id="([^"]+)"/.exec(server.lastWritten())?.[1] ?? '';
    }

    it('discovers the upload service via disco, requests a slot, PUTs the bytes, and returns the get url', async () => {
      const { server, adapter, session } = await connected();
      server.fetchImpl = () =>
        Promise.resolve({
          status: 200,
          headers: {},
          text: () => Promise.resolve(''),
          bytes: () => Promise.resolve(new Uint8Array()),
        });

      const p = adapter.uploadMedia(session, {
        bytes: new Uint8Array([1, 2, 3]),
        mime: 'image/png',
        filename: 'cat.png',
      });

      // 1. disco#items on the account's own domain.
      await tick();
      expect(server.lastWritten()).toBe(
        `<iq type="get" to="example.com" id="${lastIqId(server)}"><query xmlns="http://jabber.org/protocol/disco#items"/></iq>`,
      );
      const itemsId = lastIqId(server);
      server.send(
        `<iq type="result" id="${itemsId}"><query xmlns="http://jabber.org/protocol/disco#items">` +
          `<item jid="upload.example.com"/></query></iq>`,
      );

      // 2. disco#info on that one item, advertising the upload feature.
      await tick();
      expect(server.lastWritten()).toContain('to="upload.example.com"');
      const infoId = lastIqId(server);
      server.send(
        `<iq type="result" id="${infoId}"><query xmlns="http://jabber.org/protocol/disco#info">` +
          `<feature var="urn:xmpp:http:upload:0"/></query></iq>`,
      );

      // 3. the slot request itself.
      await tick();
      expect(server.lastWritten()).toBe(
        `<iq type="get" to="upload.example.com" id="${lastIqId(server)}">` +
          `<request xmlns="urn:xmpp:http:upload:0" filename="cat.png" size="3" content-type="image/png"/></iq>`,
      );
      const slotId = lastIqId(server);
      server.send(
        `<iq type="result" id="${slotId}"><slot xmlns="urn:xmpp:http:upload:0">` +
          `<put url="https://upload.example.com/abc/cat.png"><header name="Authorization">Basic xyz</header></put>` +
          `<get url="https://download.example.com/abc/cat.png"/></slot></iq>`,
      );

      const mediaRef = await p;
      expect(mediaRef).toBe('https://download.example.com/abc/cat.png');
      expect(server.fetchCalls).toHaveLength(1);
      expect(server.fetchCalls[0]).toMatchObject({
        url: 'https://upload.example.com/abc/cat.png',
        init: {
          method: 'PUT',
          headers: { 'content-type': 'image/png', Authorization: 'Basic xyz' },
          body: new Uint8Array([1, 2, 3]),
        },
      });
    });

    it('caches the discovered upload service — a second upload skips disco entirely', async () => {
      const { server, adapter, session } = await connected();
      server.fetchImpl = () =>
        Promise.resolve({
          status: 200,
          headers: {},
          text: () => Promise.resolve(''),
          bytes: () => Promise.resolve(new Uint8Array()),
        });

      const first = adapter.uploadMedia(session, {
        bytes: new Uint8Array(),
        mime: 'text/plain',
        filename: 'a.txt',
      });
      await tick();
      const itemsId = lastIqId(server);
      server.send(
        `<iq type="result" id="${itemsId}"><query xmlns="http://jabber.org/protocol/disco#items">` +
          `<item jid="upload.example.com"/></query></iq>`,
      );
      await tick();
      server.send(
        `<iq type="result" id="${lastIqId(server)}"><query xmlns="http://jabber.org/protocol/disco#info">` +
          `<feature var="urn:xmpp:http:upload:0"/></query></iq>`,
      );
      await tick();
      server.send(
        `<iq type="result" id="${lastIqId(server)}"><slot xmlns="urn:xmpp:http:upload:0">` +
          `<put url="https://u/1"/><get url="https://g/1"/></slot></iq>`,
      );
      await first;

      const writtenSoFar = server.written.length;
      const second = adapter.uploadMedia(session, {
        bytes: new Uint8Array(),
        mime: 'text/plain',
        filename: 'b.txt',
      });
      await tick();
      // Only ONE new iq (the slot request) — no repeat disco#items/disco#info.
      expect(server.written.length).toBe(writtenSoFar + 1);
      expect(server.lastWritten()).toContain('<request xmlns="urn:xmpp:http:upload:0"');
      server.send(
        `<iq type="result" id="${lastIqId(server)}"><slot xmlns="urn:xmpp:http:upload:0">` +
          `<put url="https://u/2"/><get url="https://g/2"/></slot></iq>`,
      );
      expect(await second).toBe('https://g/2');
    });

    it('rejects when no disco item advertises the upload feature', async () => {
      const { server, adapter, session } = await connected();
      const p = adapter.uploadMedia(session, {
        bytes: new Uint8Array(),
        mime: 'text/plain',
        filename: 'a.txt',
      });
      await tick();
      const itemsId = lastIqId(server);
      server.send(
        `<iq type="result" id="${itemsId}"><query xmlns="http://jabber.org/protocol/disco#items"/></iq>`,
      );
      await expect(p).rejects.toThrow(/no XEP-0363 HTTP Upload service/);
    });

    it('rejects when the PUT itself fails (HTTP >= 400)', async () => {
      const { server, adapter, session } = await connected();
      server.fetchImpl = () =>
        Promise.resolve({
          status: 403,
          headers: {},
          text: () => Promise.resolve(''),
          bytes: () => Promise.resolve(new Uint8Array()),
        });
      const p = adapter.uploadMedia(session, {
        bytes: new Uint8Array(),
        mime: 'text/plain',
        filename: 'a.txt',
      });
      await tick();
      server.send(
        `<iq type="result" id="${lastIqId(server)}"><query xmlns="http://jabber.org/protocol/disco#items">` +
          `<item jid="upload.example.com"/></query></iq>`,
      );
      await tick();
      server.send(
        `<iq type="result" id="${lastIqId(server)}"><query xmlns="http://jabber.org/protocol/disco#info">` +
          `<feature var="urn:xmpp:http:upload:0"/></query></iq>`,
      );
      await tick();
      server.send(
        `<iq type="result" id="${lastIqId(server)}"><slot xmlns="urn:xmpp:http:upload:0">` +
          `<put url="https://u/1"/><get url="https://g/1"/></slot></iq>`,
      );
      await expect(p).rejects.toThrow(/upload PUT failed: HTTP 403/);
    });

    it('resolveMedia accepts only an https url, with no auth headers', () => {
      const { adapter, session } = { adapter: new XmppAdapter(), session: {} as XmppSession };
      expect(adapter.resolveMedia(session, 'https://download.example.com/abc/cat.png')).toEqual({
        url: 'https://download.example.com/abc/cat.png',
        headers: {},
      });
      expect(adapter.resolveMedia(session, 'http://download.example.com/abc/cat.png')).toBeNull();
      expect(adapter.resolveMedia(session, 'javascript:alert(1)')).toBeNull();
    });
  });
});
