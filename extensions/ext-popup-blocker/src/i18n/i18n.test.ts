import { describe, expect, it } from 'vitest';
import { keyPaths } from '@tepegoz/i18n/testing';
import { popupBlockerDict } from './index';

describe('ext-popup-blocker i18n parity', () => {
  it('keeps Turkish keys in parity with English', () => {
    expect(keyPaths(popupBlockerDict.tr)).toEqual(keyPaths(popupBlockerDict.en));
  });
});
