import { describe, expect, it } from 'vitest';
import { keyPaths } from '@tepegoz/i18n/testing';
import { findBarDict } from './index';

describe('find-bar i18n parity', () => {
  it('keeps Turkish keys in parity with English', () => {
    expect(keyPaths(findBarDict.tr)).toEqual(keyPaths(findBarDict.en));
  });
});
