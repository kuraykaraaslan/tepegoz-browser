import { describe, expect, it } from 'vitest';
import { keyPaths } from '@tepegoz/i18n/testing';
import { uploadsDict } from './index';

describe('uploads-ui i18n parity', () => {
  it('keeps Turkish keys in parity with English', () => {
    expect(keyPaths(uploadsDict.tr)).toEqual(keyPaths(uploadsDict.en));
  });
});
