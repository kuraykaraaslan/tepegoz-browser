import { describe, expect, it } from 'vitest';
import { keyPaths } from '@tepegoz/i18n/testing';
import { videoPlayerDict } from './index';

describe('ext-video-player i18n parity', () => {
  it('keeps Turkish keys in parity with English', () => {
    expect(keyPaths(videoPlayerDict.tr)).toEqual(keyPaths(videoPlayerDict.en));
  });
});
