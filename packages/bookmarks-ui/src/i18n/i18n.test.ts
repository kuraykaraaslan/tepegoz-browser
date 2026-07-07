import { describe, expect, it } from 'vitest';
import { keyPaths } from '@tepegoz/i18n/testing';
import { bookmarksUiDict } from './index';

describe('bookmarks-ui i18n parity', () => {
  it('keeps Turkish keys in parity with English', () => {
    expect(keyPaths(bookmarksUiDict.tr)).toEqual(keyPaths(bookmarksUiDict.en));
  });
});
