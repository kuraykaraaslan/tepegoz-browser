// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { NotEncryptedBadge } from './NotEncryptedBadge';

afterEach(cleanup);

const wrap = (ui: ReactElement, locale: 'en' | 'tr' = 'en') =>
  render(<I18nProvider locale={locale}>{ui}</I18nProvider>);

describe('NotEncryptedBadge', () => {
  it('renders the localized label with the plaintext explanation as its title', () => {
    wrap(<NotEncryptedBadge />);
    const badge = screen.getByText('Not encrypted');
    expect(badge.getAttribute('title')).toBe(
      'IRC has no end-to-end encryption — messages are readable by the server.',
    );
  });

  it('localizes to Turkish', () => {
    wrap(<NotEncryptedBadge />, 'tr');
    expect(screen.getByText('Şifresiz')).toBeDefined();
  });
});
