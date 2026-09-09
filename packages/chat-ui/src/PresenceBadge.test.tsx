// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { PresenceBadge } from './PresenceBadge';

afterEach(cleanup);

describe('PresenceBadge', () => {
  it('renders the localized label and carries the tone / online data attributes', () => {
    render(
      <I18nProvider locale="en">
        <PresenceBadge presence="dnd" />
      </I18nProvider>,
    );
    const badge = screen.getByText('Do not disturb').closest('.chat-presence');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('data-tone')).toBe('busy');
    expect(badge?.getAttribute('data-online')).toBe('true');
    expect(badge?.getAttribute('data-dot-only')).toBe('false');
  });

  it('localizes to Turkish', () => {
    render(
      <I18nProvider locale="tr">
        <PresenceBadge presence="online" />
      </I18nProvider>,
    );
    expect(screen.getByText('Çevrimiçi')).toBeDefined();
  });

  it('in dotOnly mode keeps the label as the accessible name and sets the title', () => {
    render(
      <I18nProvider locale="en">
        <PresenceBadge presence="offline" dotOnly />
      </I18nProvider>,
    );
    const badge = screen.getByText('Offline').closest('.chat-presence');
    expect(badge?.getAttribute('data-dot-only')).toBe('true');
    expect(badge?.getAttribute('data-online')).toBe('false');
    expect(badge?.getAttribute('title')).toBe('Offline');
  });
});
