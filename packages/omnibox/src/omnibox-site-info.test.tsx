// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Omnibox } from './omnibox';
import { createOmniboxHelpers, oneSuggestion, securityLabels } from './omnibox-test-helpers';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const { baseProps } = createOmniboxHelpers(vi, screen);

describe('Omnibox', () => {
  it('shows a lock for a secure page and no "Not secure" text', () => {
    const { container } = render(
      <Omnibox
        {...baseProps({ securityLevel: 'secure', securityLabels, onOpenSiteInfo: vi.fn() })}
      />,
    );
    expect(container.querySelector('svg[data-icon="lock"]')).not.toBeNull();
    expect(screen.queryByText('Not secure')).toBeNull();
    expect(screen.getByRole('button', { name: 'View site information' })).toBeTruthy();
  });

  it('shows a red "Not secure" label + triangle for an http page and opens the bubble with a rect', () => {
    const onOpenSiteInfo =
      vi.fn<(a: { x: number; y: number; width: number; height: number }) => void>();
    const { container } = render(
      <Omnibox
        {...baseProps({
          currentUrl: 'http://localhost:3000/',
          securityLevel: 'not-secure',
          securityLabels,
          onOpenSiteInfo,
        })}
      />,
    );
    expect(container.querySelector('svg[data-icon="triangle-exclamation"]')).not.toBeNull();
    expect(screen.getByText('Not secure')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'View site information' }));
    expect(onOpenSiteInfo).toHaveBeenCalledTimes(1);
    const anchor = onOpenSiteInfo.mock.calls[0]![0];
    expect(typeof anchor.x).toBe('number');
    expect(typeof anchor.y).toBe('number');
    expect(typeof anchor.width).toBe('number');
    expect(typeof anchor.height).toBe('number');
  });

  it('renders no site-info control for an unknown level or without labels', () => {
    const { container, rerender } = render(
      <Omnibox
        {...baseProps({ securityLevel: 'unknown', securityLabels, onOpenSiteInfo: vi.fn() })}
      />,
    );
    expect(screen.queryByRole('button', { name: 'View site information' })).toBeNull();
    rerender(<Omnibox {...baseProps({ securityLevel: 'secure', onOpenSiteInfo: vi.fn() })} />);
    expect(container.querySelector('svg[data-icon="lock"]')).toBeNull();
  });

  it('renders the glyph as a plain indicator (no button) when onOpenSiteInfo is omitted', () => {
    render(<Omnibox {...baseProps({ securityLevel: 'internal', securityLabels })} />);
    expect(screen.queryByRole('button', { name: 'View site information' })).toBeNull();
  });

  it('gives a navigation suggestion a globe, not the search glyph (§ A6)', async () => {
    const { container } = render(
      <Omnibox
        {...baseProps({
          onSuggest: vi.fn(
            oneSuggestion({
              key: 'n',
              kind: 'navigate',
              title: 'example.com',
              action: { type: 'navigate', input: 'example.com' },
            }),
          ),
        })}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'example' } });
    await screen.findByRole('option', { name: 'example.com' });

    expect(container.querySelector('li svg[data-icon="globe"]')).not.toBeNull();
    expect(container.querySelector('li svg[data-icon="magnifying-glass"]')).toBeNull();
  });

  it('shows a row favicon as an <img> in place of the kind glyph', async () => {
    const favicon = 'data:image/png;base64,iVBORw0KGgo=';
    const { container } = render(
      <Omnibox
        {...baseProps({
          onSuggest: vi.fn(
            oneSuggestion({
              key: 'h',
              kind: 'history',
              title: 'Example Blog',
              faviconUrl: favicon,
              action: { type: 'navigate', input: 'https://example.com/blog' },
            }),
          ),
        })}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'example' } });
    await screen.findByRole('option', { name: 'Example Blog' });

    const img = container.querySelector('li img');
    expect(img?.getAttribute('src')).toBe(favicon);
    expect(container.querySelector('li svg[data-icon="clock-rotate-left"]')).toBeNull();
  });

  it('falls back to the kind glyph when the favicon image fails to decode', async () => {
    const { container } = render(
      <Omnibox
        {...baseProps({
          onSuggest: vi.fn(
            oneSuggestion({
              key: 'h',
              kind: 'history',
              title: 'Broken Icon',
              faviconUrl: 'data:image/png;base64,zzzz',
              action: { type: 'navigate', input: 'https://broken.test/' },
            }),
          ),
        })}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'broken' } });
    await screen.findByRole('option', { name: 'Broken Icon' });

    fireEvent.error(container.querySelector('li img')!);
    expect(container.querySelector('li img')).toBeNull();
    expect(container.querySelector('li svg[data-icon="clock-rotate-left"]')).not.toBeNull();
  });
});
