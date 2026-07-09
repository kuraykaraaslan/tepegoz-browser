import { describe, expect, it } from 'vitest';
import { en } from './en';
import { tr } from './tr';

describe('typo i18n', () => {
  it('keeps Turkish strings in parity with English strings', () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
  });
});
