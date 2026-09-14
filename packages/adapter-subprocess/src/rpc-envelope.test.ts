import { describe, expect, it } from 'vitest';
import {
  LineBuffer,
  MAX_LINE_BYTES,
  decodeFrame,
  encodeFrame,
  isRpcEvent,
  isRpcResponseOk,
} from './rpc-envelope';

describe('encodeFrame / decodeFrame', () => {
  it('encodeFrame produces newline-terminated JSON matching the request shape', () => {
    const encoded = encodeFrame({ id: '1', method: 'sendMessage', params: { body: 'hi' } });
    expect(encoded.endsWith('\n')).toBe(true);
    expect(JSON.parse(encoded.trimEnd())).toEqual({
      id: '1',
      method: 'sendMessage',
      params: { body: 'hi' },
    });
    // decodeFrame is the child→parent direction only — a request frame has neither result, error,
    // nor event, so it correctly does not decode as any inbound frame kind.
    expect(decodeFrame(encoded.trimEnd())).toBeNull();
  });

  it('decodes an ok response, an error response, and an event', () => {
    expect(decodeFrame(JSON.stringify({ id: '1', result: { protocolId: 'p1' } }))).toEqual({
      id: '1',
      result: { protocolId: 'p1' },
    });
    expect(decodeFrame(JSON.stringify({ id: '1', error: { message: 'boom' } }))).toEqual({
      id: '1',
      error: { message: 'boom' },
    });
    expect(decodeFrame(JSON.stringify({ event: 'message', params: { body: 'hi' } }))).toEqual({
      event: 'message',
      params: { body: 'hi' },
    });
  });

  it('returns null on malformed JSON, never throws', () => {
    expect(decodeFrame('{not json')).toBeNull();
    expect(decodeFrame('')).toBeNull();
  });

  it('returns null on well-formed JSON that matches none of the three frame shapes', () => {
    expect(decodeFrame(JSON.stringify({ foo: 'bar' }))).toBeNull();
    expect(decodeFrame(JSON.stringify({ id: '1' }))).toBeNull(); // neither result nor error
    expect(decodeFrame('42')).toBeNull();
    expect(decodeFrame('null')).toBeNull();
  });
});

describe('isRpcEvent / isRpcResponseOk', () => {
  it('narrows correctly across all three frame kinds', () => {
    const event = decodeFrame(JSON.stringify({ event: 'x' }));
    const ok = decodeFrame(JSON.stringify({ id: '1', result: 1 }));
    const err = decodeFrame(JSON.stringify({ id: '1', error: { message: 'x' } }));
    expect(event && isRpcEvent(event)).toBe(true);
    expect(ok && isRpcEvent(ok)).toBe(false);
    expect(ok && isRpcResponseOk(ok)).toBe(true);
    expect(err && isRpcResponseOk(err)).toBe(false);
  });
});

describe('LineBuffer', () => {
  it('yields nothing until a newline arrives, then the complete line', () => {
    const buf = new LineBuffer();
    expect(buf.push('{"event":"x"}').lines).toEqual([]);
    expect(buf.push('\n').lines).toEqual(['{"event":"x"}']);
  });

  it('splits multiple lines delivered in one chunk', () => {
    const buf = new LineBuffer();
    const { lines } = buf.push('{"a":1}\n{"b":2}\n{"c":3}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  it('carries a partial trailing line over to the next push', () => {
    const buf = new LineBuffer();
    expect(buf.push('{"a":1}\n{"partial"').lines).toEqual(['{"a":1}']);
    expect(buf.push(':true}\n').lines).toEqual(['{"partial":true}']);
  });

  it('skips blank lines without emitting them', () => {
    const buf = new LineBuffer();
    expect(buf.push('\n\n{"a":1}\n\n').lines).toEqual(['{"a":1}']);
  });

  it('drops (does not buffer forever) a single line exceeding MAX_LINE_BYTES and reports overflow', () => {
    const buf = new LineBuffer();
    const huge = 'x'.repeat(MAX_LINE_BYTES + 1);
    const result = buf.push(huge); // no newline yet — still "buffering"
    expect(result.overflow).toBe(true);
    expect(buf.hasOverflowed()).toBe(true);
    // the buffer was cleared, not left holding the runaway line forever
    expect(buf.push('{"ok":1}\n').lines).toEqual(['{"ok":1}']);
  });
});
