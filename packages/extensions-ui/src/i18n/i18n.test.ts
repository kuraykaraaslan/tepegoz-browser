import { describe, it, expect } from 'vitest';
import { keyPaths } from '@tepegoz/i18n/testing';
import { en } from './en';
import { tr } from './tr';

describe('extensions-ui i18n parity', () => {
  it('tr has the exact same key set as en (source of truth)', () => {
    expect(keyPaths(tr).sort()).toEqual(keyPaths(en).sort());
  });
});
