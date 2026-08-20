import { describe, expect, it } from 'vitest';
import { checkLocalePackParity } from './locale-pack-parity';

const base = {
  common: { save: 'Save', cancel: 'Cancel' },
  errors: { notFound: 'Not found' },
};

describe('locale-pack parity', () => {
  it('passes an exact structural match', () => {
    const pack = { common: { save: 'Kaydet', cancel: 'İptal' }, errors: { notFound: 'Bulunamadı' } };
    expect(checkLocalePackParity(base, pack)).toEqual({
      ok: true,
      missingKeys: [],
      extraKeys: [],
      shapeMismatches: [],
    });
  });

  it('catches a MISSING key, at any depth', () => {
    const pack = { common: { save: 'Kaydet' }, errors: { notFound: 'Bulunamadı' } };
    const r = checkLocalePackParity(base, pack);
    expect(r.ok).toBe(false);
    expect(r.missingKeys).toEqual(['common.cancel']);
  });

  it('catches an EXTRA key not in the base shape', () => {
    const pack = {
      common: { save: 'Kaydet', cancel: 'İptal', extra: 'Fazladan' },
      errors: { notFound: 'Bulunamadı' },
    };
    const r = checkLocalePackParity(base, pack);
    expect(r.ok).toBe(false);
    expect(r.extraKeys).toEqual(['common.extra']);
  });

  it('catches a SHAPE MISMATCH — a string turned into a nested object at the same path', () => {
    // This is the failure that actually breaks a caller: t('common.save') expects a string and gets an
    // object, which is a different bug from the key simply being absent.
    const pack = { common: { save: { nested: 'oops' }, cancel: 'İptal' }, errors: { notFound: 'x' } };
    const r = checkLocalePackParity(base, pack);
    expect(r.ok).toBe(false);
    expect(r.shapeMismatches).toEqual(['common.save']);
  });

  it('catches the mismatch in the OTHER direction too — an object turned into a string', () => {
    const pack = { common: 'not an object any more', errors: { notFound: 'x' } };
    const r = checkLocalePackParity(base, pack);
    expect(r.ok).toBe(false);
    expect(r.shapeMismatches).toContain('common');
    // Everything nested under the now-flattened section reads as missing, not as "fine because the
    // parent matched" — a caller reaching common.save still finds nothing.
    expect(r.missingKeys).toEqual(expect.arrayContaining(['common.save', 'common.cancel']));
  });

  it('reports EVERY missing key when the pack is empty, not just the first', () => {
    const r = checkLocalePackParity(base, {});
    expect(r.missingKeys.sort()).toEqual(['common.cancel', 'common.save', 'errors.notFound']);
  });

  it('does not throw on completely malformed, untrusted input', () => {
    expect(() => checkLocalePackParity(base, null)).not.toThrow();
    expect(() => checkLocalePackParity(base, 'a string')).not.toThrow();
    expect(() => checkLocalePackParity(base, 42)).not.toThrow();
    expect(() => checkLocalePackParity(base, ['array', 'not', 'object'])).not.toThrow();
    expect(checkLocalePackParity(base, null).ok).toBe(false);
  });

  it('ignores a non-string, non-object leaf value in the pack — it is neither present nor walkable', () => {
    const pack = { common: { save: 42, cancel: 'İptal' }, errors: { notFound: 'x' } };
    const r = checkLocalePackParity(base, pack);
    expect(r.missingKeys).toContain('common.save');
  });
});
