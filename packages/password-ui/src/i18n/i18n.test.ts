import { describe, expect, it } from 'vitest';
import { keyPaths } from '@tepegoz/i18n/testing';
import { passwordUiDict } from './index';

describe('password-ui i18n parity', () => {
  it('keeps Turkish keys in parity with English', () => {
    expect(keyPaths(passwordUiDict.tr)).toEqual(keyPaths(passwordUiDict.en));
  });
});
