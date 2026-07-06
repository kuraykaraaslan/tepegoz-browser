import { describe, expect, it } from 'vitest';
import { keyPaths } from '@tepegoz/i18n/testing';
import { en } from './en';
import { tr } from './tr';

describe('tasks-ui i18n', () => {
  it('keeps Turkish keys in parity with English', () => {
    expect(keyPaths(tr).sort()).toEqual(keyPaths(en).sort());
  });
});
