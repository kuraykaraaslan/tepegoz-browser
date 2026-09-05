// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { readerDict } from '@tepegoz/reader/view';
import type { ReaderArticle } from '@tepegoz/reader';
import type { ReaderState } from '../app-reader';
import { ReaderSurface } from './ReaderSurface';

/**
 * The reading view as it sits over the content area, plus its two non-article states. Presentational —
 * `ReaderView` (the article renderer) is `@tepegoz/reader/view`'s own, fully covered package; this only
 * pins which of the four `ReaderState` statuses shows which chrome, and that Exit reaches `onClose`.
 */

const t = readerDict.en;

function article(over: Partial<ReaderArticle> = {}): ReaderArticle {
  return { title: 'A long-form piece', byline: '', siteName: '', blocks: [], wordCount: 400, ...over };
}

function renderSurface(reader: ReaderState, onClose = vi.fn()) {
  const utils = render(
    <I18nProvider locale="en">
      <ReaderSurface reader={reader} onClose={onClose} />
    </I18nProvider>,
  );
  return { ...utils, onClose };
}

afterEach(cleanup);

describe('ReaderSurface', () => {
  it('renders nothing when the reader is off', () => {
    const { container } = renderSurface({ status: 'off' });
    expect(container.innerHTML).toBe('');
  });

  it('shows a working indicator while extraction runs, and Exit reaches onClose', () => {
    const { onClose } = renderSurface({ status: 'working' });
    expect(screen.getByText(t.working)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.exit }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the no-article message when extraction found nothing to read', () => {
    renderSurface({ status: 'none' });
    expect(screen.getByText(t.noArticleTitle)).toBeTruthy();
    expect(screen.getByText(t.noArticleBody)).toBeTruthy();
  });

  it('renders the extracted article', () => {
    renderSurface({ status: 'article', article: article({ title: 'The Piece' }) });
    expect(screen.getByText('The Piece')).toBeTruthy();
    expect(screen.getByRole('button', { name: t.exit })).toBeTruthy();
  });
});
