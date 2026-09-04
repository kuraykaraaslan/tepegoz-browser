import { describe, expect, it } from 'vitest';
import {
  MacroAttachCsvSchema,
  MacroIdSchema,
  MacroRunDraftSchema,
  MacroRunInputSchema,
  MacroSchema,
  parseMacro,
} from './schemas-macros';

/**
 * The runtime (zod) guards for the `macros:*` IPC channels — the untrusted renderer → main direction.
 * The macro IR validator itself lives in `@tepegoz/shared-types`; this module owns the per-channel
 * wrappers (id bounds, the `variables` record bounds, the CSV size cap).
 */

const validMacro = { id: 'm1', name: 'Fill form', version: 1, variables: [], steps: [] };

describe('MacroIdSchema', () => {
  it('accepts a 1..128 char id and rejects empty / over-long', () => {
    expect(MacroIdSchema.parse('m1')).toBe('m1');
    expect(MacroIdSchema.safeParse('').success).toBe(false);
    expect(MacroIdSchema.safeParse('x'.repeat(129)).success).toBe(false);
  });
});

describe('MacroRunInputSchema', () => {
  it('accepts an id with optional bounded variables', () => {
    expect(MacroRunInputSchema.parse({ macroId: 'm1', variables: { who: 'ada' } })).toEqual({
      macroId: 'm1',
      variables: { who: 'ada' },
    });
    expect(MacroRunInputSchema.parse({ macroId: 'm1' })).toEqual({ macroId: 'm1' });
  });

  it('rejects a missing id, an over-long var name, and an over-long var value', () => {
    expect(MacroRunInputSchema.safeParse({}).success).toBe(false);
    expect(
      MacroRunInputSchema.safeParse({ macroId: 'm1', variables: { ['n'.repeat(65)]: 'v' } }).success,
    ).toBe(false);
    expect(
      MacroRunInputSchema.safeParse({ macroId: 'm1', variables: { n: 'v'.repeat(10_001) } }).success,
    ).toBe(false);
  });
});

describe('MacroRunDraftSchema', () => {
  it('accepts a full macro IR plus optional variables', () => {
    expect(MacroRunDraftSchema.parse({ macro: validMacro, variables: { a: '1' } })).toMatchObject({
      macro: { id: 'm1' },
    });
  });

  it('rejects a malformed macro IR', () => {
    expect(MacroRunDraftSchema.safeParse({ macro: { id: 'm1' } }).success).toBe(false);
  });
});

describe('MacroAttachCsvSchema', () => {
  it('accepts CSV text and rejects a blob over the 10 MiB cap', () => {
    expect(MacroAttachCsvSchema.parse({ content: 'a,b\n1,2' })).toEqual({ content: 'a,b\n1,2' });
    expect(MacroAttachCsvSchema.safeParse({ content: 'x'.repeat(10_485_761) }).success).toBe(false);
  });
});

describe('re-exported macro IR validator', () => {
  it('MacroSchema / parseMacro round-trip a valid macro and reject junk', () => {
    expect(MacroSchema.parse(validMacro)).toMatchObject({ id: 'm1', version: 1 });
    expect(parseMacro(validMacro).success).toBe(true);
    expect(parseMacro({ id: 'm1' }).success).toBe(false);
  });
});
