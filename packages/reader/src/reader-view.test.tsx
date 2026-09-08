// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { ReaderArticle } from './article';
import { readerDict } from './i18n';
import {
  DEFAULT_READER_PREFERENCES,
  FONT_SCALE_STEPS,
  type ReaderPreferences,
} from './reader-preferences';
import { ReaderView } from './reader-view';

/**
 * The reading-options toolbar: the font-size buttons clamp at the ends of the range and the theme
 * picker swaps the class on the reading container. `ReaderView` is presentational, so the test drives
 * it as a controlled component — the host owns the preference and its persistence.
 */

const t = readerDict.en;
const MAX = FONT_SCALE_STEPS[FONT_SCALE_STEPS.length - 1]!;

const ARTICLE: ReaderArticle = {
  title: 'The Tide Clock',
  byline: '',
  siteName: '',
  blocks: [{ kind: 'paragraph', text: 'A tide clock tracks the moon.' }],
  wordCount: 120,
};

function Harness({
  initial = DEFAULT_READER_PREFERENCES,
  onChange,
}: {
  initial?: ReaderPreferences;
  onChange?: (next: ReaderPreferences) => void;
}) {
  const [prefs, setPrefs] = useState<ReaderPreferences>(initial);
  return (
    <I18nProvider locale="en">
      <ReaderView
        article={ARTICLE}
        preferences={prefs}
        onPreferencesChange={(next) => {
          onChange?.(next);
          setPrefs(next);
        }}
      />
    </I18nProvider>
  );
}

function surface(): HTMLElement {
  // The reading container — `role="article"` is the <article> inside it, its parent is the surface.
  const article = screen.getByRole('article');
  return article.parentElement as HTMLElement;
}

afterEach(cleanup);

describe('ReaderView reading-options toolbar', () => {
  it('renders the font-size buttons and the theme picker', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: t.fontIncrease })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.fontDecrease })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: t.themeLabel })).toBeTruthy();
  });

  it('starts at the default scale and theme class', () => {
    render(<Harness />);
    expect(surface().className).toContain('reader-scale-1');
    expect(surface().className).toContain('reader-theme-light');
  });

  it('font+ steps the scale up, and is clamped (and disabled) at the maximum', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const bigger = screen.getByRole('button', { name: t.fontIncrease });

    fireEvent.click(bigger);
    expect(onChange).toHaveBeenLastCalledWith({ fontScale: 1.15, theme: 'light' });
    expect(surface().className).toContain('reader-scale-2');

    // Walk to the ceiling; the last step must not overshoot the range.
    fireEvent.click(bigger);
    fireEvent.click(bigger);
    fireEvent.click(bigger);
    expect(onChange).toHaveBeenLastCalledWith({ fontScale: MAX, theme: 'light' });
    expect(surface().className).toContain(`reader-scale-${String(FONT_SCALE_STEPS.length - 1)}`);
    expect(screen.getByRole('button', { name: t.fontIncrease })).toHaveProperty('disabled', true);
  });

  it('the theme picker swaps the class on the reading container', () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole('combobox', { name: t.themeLabel }), {
      target: { value: 'dark' },
    });
    expect(surface().className).toContain('reader-theme-dark');
    expect(surface().className).not.toContain('reader-theme-light');
  });
});
