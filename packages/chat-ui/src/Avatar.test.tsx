// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { Avatar, avatarHue, avatarInitials } from './Avatar';

afterEach(cleanup);

const wrap = (locale: 'en' | 'tr', ui: React.ReactElement) =>
  render(<I18nProvider locale={locale}>{ui}</I18nProvider>);

describe('avatarInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(avatarInitials('Ada Lovelace')).toBe('AL');
  });

  it('falls back to the first two characters of a single token', () => {
    expect(avatarInitials('bob')).toBe('BO');
  });

  it('splits handle separators (@ . _ - / :)', () => {
    expect(avatarInitials('ada@example.org')).toBe('AE');
    expect(avatarInitials('#tepegoz:matrix.org')).toBe('TM');
  });

  it('upper-cases in the given locale (Turkish dotless/dotted i)', () => {
    expect(avatarInitials('irem', 'tr')).toBe('İR');
    expect(avatarInitials('irem', 'en')).toBe('IR');
  });

  it('is empty for an empty name', () => {
    expect(avatarInitials('   ')).toBe('');
  });
});

describe('avatarHue', () => {
  it('is deterministic and in range', () => {
    const h = avatarHue('work-account/bob@x');
    expect(h).toBe(avatarHue('work-account/bob@x'));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });

  it('varies by seed', () => {
    expect(avatarHue('alice')).not.toBe(avatarHue('bob'));
  });
});

describe('<Avatar>', () => {
  it('renders the initials via a data attribute and no text content', () => {
    const { container } = wrap('en', <Avatar name="Ada Lovelace" seed="c1" />);
    const el = container.querySelector('.chat-avatar');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('data-initials')).toBe('AL');
    // the stylesheet draws the glyphs — the element must not leak text to its parent
    expect(el?.textContent).toBe('');
    expect(el?.getAttribute('aria-hidden')).toBe('true');
  });

  it('carries the hue as a CSS custom property and honours the size', () => {
    const { container } = wrap('en', <Avatar name="Bob" seed="c2" size="sm" />);
    const el = container.querySelector('.chat-avatar') as HTMLElement;
    expect(el.getAttribute('data-size')).toBe('sm');
    expect(el.style.getPropertyValue('--chat-avatar-hue')).toBe(String(avatarHue('c2')));
  });

  it('uses the name as the hue seed when no seed is given', () => {
    const { container } = wrap('en', <Avatar name="Carol" />);
    const el = container.querySelector('.chat-avatar') as HTMLElement;
    expect(el.style.getPropertyValue('--chat-avatar-hue')).toBe(String(avatarHue('Carol')));
  });
});
