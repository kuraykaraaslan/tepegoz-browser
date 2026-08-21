import { describe, expect, it } from 'vitest';
import { keyPaths } from '@tepegoz/i18n/testing';
import { authPromptDict } from './index';

describe('auth-prompt-ui i18n parity', () => {
  it('keeps Turkish keys in parity with English', () => {
    expect(keyPaths(authPromptDict.tr)).toEqual(keyPaths(authPromptDict.en));
  });
});
