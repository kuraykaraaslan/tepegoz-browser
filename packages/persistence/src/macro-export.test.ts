import { describe, expect, it } from 'vitest';
import type { Macro } from '@tepegoz/shared-types';
import {
  MACROS_EXPORT_FORMAT,
  MACROS_EXPORT_VERSION,
  parseMacrosImport,
  serializeMacrosJson,
} from './macro-export';

const macro = (id: string, name: string): Macro => ({
  id,
  name,
  version: 1,
  variables: [],
  steps: [
    { kind: 'navigate', url: 'https://example.com/' },
    { kind: 'click', target: [{ kind: 'css', value: '#go' }] },
  ],
});

describe('serializeMacrosJson', () => {
  it('wraps the macros in a versioned, format-marked envelope and ends with a newline', () => {
    const out = serializeMacrosJson([macro('m1', 'Login')]);
    expect(out.endsWith('\n')).toBe(true);
    expect(JSON.parse(out)).toEqual({
      format: MACROS_EXPORT_FORMAT,
      version: MACROS_EXPORT_VERSION,
      macros: [macro('m1', 'Login')],
    });
  });

  it('writes an empty macro list rather than omitting the key', () => {
    expect(JSON.parse(serializeMacrosJson([]))).toMatchObject({ macros: [] });
  });
});

describe('parseMacrosImport', () => {
  it('round-trips what serializeMacrosJson wrote', () => {
    const json = serializeMacrosJson([macro('m1', 'A'), macro('m2', 'B')]);
    const { macros, skipped } = parseMacrosImport(json);
    expect(macros.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(skipped).toBe(0);
  });

  it('also accepts a bare JSON array of macros', () => {
    const { macros, skipped } = parseMacrosImport(JSON.stringify([macro('m1', 'A')]));
    expect(macros).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it('skips an entry the macro schema rejects, keeping the rest', () => {
    const json = JSON.stringify({
      format: MACROS_EXPORT_FORMAT,
      version: 1,
      macros: [macro('m1', 'A'), { id: 'bad', name: '', steps: 'nope' }, macro('m2', 'B')],
    });
    const { macros, skipped } = parseMacrosImport(json);
    expect(macros.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(skipped).toBe(1);
  });

  it('throws a SyntaxError on text that is not JSON', () => {
    expect(() => parseMacrosImport('not json {')).toThrow(SyntaxError);
  });

  it('throws a SyntaxError on JSON with no macro list (object, number, null)', () => {
    expect(() => parseMacrosImport('{"format":"tepegoz.macros"}')).toThrow(SyntaxError);
    expect(() => parseMacrosImport('42')).toThrow(SyntaxError);
    expect(() => parseMacrosImport('null')).toThrow(SyntaxError);
  });

  it('returns an all-skipped result (not a throw) for a list of only bad entries', () => {
    const { macros, skipped } = parseMacrosImport(JSON.stringify([{ nope: 1 }, { nope: 2 }]));
    expect(macros).toEqual([]);
    expect(skipped).toBe(2);
  });
});
