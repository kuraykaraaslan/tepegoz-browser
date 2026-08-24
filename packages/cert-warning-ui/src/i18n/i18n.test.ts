import { describe, expect, it } from 'vitest';
import { keyPaths } from '@tepegoz/i18n/testing';
import { certWarningDict, clientCertPickerDict } from './index';

describe('cert-warning-ui i18n parity', () => {
  it('keeps Turkish keys in parity with English', () => {
    expect(keyPaths(certWarningDict.tr)).toEqual(keyPaths(certWarningDict.en));
  });

  /** This package owns two surfaces now (the site's certificate, and the user's). Both are checked —
   *  a parity test that only knows about the first would go quietly stale the day the second landed. */
  it('keeps the client-certificate picker in parity too', () => {
    expect(keyPaths(clientCertPickerDict.tr)).toEqual(keyPaths(clientCertPickerDict.en));
  });
});
