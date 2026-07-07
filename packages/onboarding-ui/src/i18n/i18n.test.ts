import { describe, expect, it } from 'vitest';
import { keyPaths } from '@tepegoz/i18n/testing';
import { en } from './en';
import { tr } from './tr';

describe('@tepegoz/onboarding-ui i18n', () => {
  it('keeps Turkish keys aligned with English', () => {
    expect(keyPaths(tr).sort()).toEqual(keyPaths(en).sort());
  });
});
