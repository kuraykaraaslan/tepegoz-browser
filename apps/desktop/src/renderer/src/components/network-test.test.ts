import { describe, expect, it } from 'vitest';
import type { ConnectionTestResult } from '@tepegoz/shared-types';
import { parseConnectionTestResult } from './network-test';

/**
 * The renderer's read of a `network:test-connection` response. `safeParse`d at this boundary like every
 * other main→renderer payload this phase pushes: a record that does not validate must yield `null`, not
 * a thrown error or a stage panel rendered from a shape the main process could never actually emit.
 */

const ok: ConnectionTestResult = {
  connectionId: 'c1',
  configParse: { status: 'pass', detail: null },
  handshake: { status: 'fail', detail: 'Nothing is listening on 127.0.0.1:9050' },
  reachability: 'notReached',
};

describe('parseConnectionTestResult', () => {
  it('accepts a well-formed record', () => {
    expect(parseConnectionTestResult(ok)).toEqual(ok);
  });

  it('accepts a skipped stage with a null detail', () => {
    const skipped: ConnectionTestResult = {
      ...ok,
      handshake: { status: 'skipped', detail: null },
    };
    expect(parseConnectionTestResult(skipped)).toEqual(skipped);
  });

  it.each([
    ['an unknown stage status', { ...ok, configParse: { status: 'maybe', detail: null } }],
    ['an unknown reachability value', { ...ok, reachability: 'confirmed' }],
    ['a malformed connection id', { ...ok, connectionId: 'Not A Slug!' }],
    ['a missing field', { connectionId: 'c1', configParse: { status: 'pass', detail: null } }],
    ['not an object', 42],
    ['null', null],
  ])('rejects %s → null', (_label, raw) => {
    expect(parseConnectionTestResult(raw)).toBeNull();
  });
});
