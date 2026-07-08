import { describe, expect, it } from 'vitest';
import { keyPaths } from '@tepegoz/i18n/testing';
import { adblockDict } from './index';

describe('ext-adblock i18n parity', () => {
  it('keeps Turkish keys in parity with English', () => {
    expect(keyPaths(adblockDict.tr)).toEqual(keyPaths(adblockDict.en));
  });
});
