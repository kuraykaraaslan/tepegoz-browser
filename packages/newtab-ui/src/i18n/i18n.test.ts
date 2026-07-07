import { describe, expect, it } from 'vitest';
import { keyPaths } from '@tepegoz/i18n/testing';
import { newtabDict } from './index';

describe('newtab-ui i18n parity', () => {
  it('keeps Turkish keys in parity with English', () => {
    expect(keyPaths(newtabDict.tr)).toEqual(keyPaths(newtabDict.en));
  });
});
