import { describe, expect, it } from 'vitest';
import { keyPaths } from '@tepegoz/i18n/testing';
import { en } from './en';
import { tr } from './tr';

describe('agent-history-ui i18n parity', () => {
  it('tr has the exact same key set as en (source of truth)', () => {
    expect(keyPaths(tr).sort()).toEqual(keyPaths(en).sort());
  });
});
