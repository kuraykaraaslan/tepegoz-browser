import { describe, expect, it } from 'vitest';
import { keyPaths } from '@tepegoz/i18n/testing';
import { certWarningDict } from './index';

describe('cert-warning-ui i18n parity', () => {
  it('keeps Turkish keys in parity with English', () => {
    expect(keyPaths(certWarningDict.tr)).toEqual(keyPaths(certWarningDict.en));
  });
});
