// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { AdaptorConnection } from '@tepegoz/desktop-ipc';
import type { AdaptorPermission } from '@tepegoz/shared-types';
import { AdaptorsSection } from './settings-adaptors-section';

/**
 * Settings → adaptor inventory. The readability rule it exists for: a permission's scope list must be
 * fully readable — the old UI truncated at "+3" with no way to see the rest. So a permission with more
 * than four scopes shows four plus "+N", and a single button expands the row to all of them.
 */

const listAdaptors = vi.fn();

function perm(over: Partial<AdaptorPermission> = {}): AdaptorPermission {
  return { capability: 'mail', scopes: [], state: 'connected', ...over };
}

function adaptor(over: Partial<AdaptorConnection> = {}): AdaptorConnection {
  return {
    id: 'a1',
    label: 'Gmail',
    kind: 'oauth_service',
    provider: 'google',
    state: 'connected',
    authKind: 'oauth',
    permissions: [],
    auditRequired: false,
    toolCount: 3,
    ...over,
  };
}

beforeEach(() => {
  listAdaptors.mockReset().mockResolvedValue([]);
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: { listAdaptors } });
});
afterEach(cleanup);

function renderSection() {
  render(
    <I18nProvider locale="en">
      <AdaptorsSection />
    </I18nProvider>,
  );
}

describe('AdaptorsSection', () => {
  it('shows the empty state when no adaptors are configured', async () => {
    renderSection();
    await waitFor(() => expect(listAdaptors).toHaveBeenCalled());
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('renders one row per adaptor with its label', async () => {
    listAdaptors.mockResolvedValue([adaptor({ id: 'a1', label: 'Gmail' }), adaptor({ id: 'a2', label: 'Drive' })]);
    renderSection();
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    expect(screen.getByText('Gmail')).toBeTruthy();
    expect(screen.getByText('Drive')).toBeTruthy();
  });

  it('truncates a long scope list to four plus a "+N" count, then expands on demand', async () => {
    const scopes = ['s1', 's2', 's3', 's4', 's5', 's6'];
    listAdaptors.mockResolvedValue([adaptor({ permissions: [perm({ capability: 'mail', scopes })] })]);
    renderSection();

    const row = await screen.findByRole('listitem');
    // collapsed: first four shown, two hidden
    expect(within(row).getByText(/mail: s1, s2, s3, s4, \+2/)).toBeTruthy();

    fireEvent.click(within(row).getByRole('button'));
    expect(within(row).getByText(/mail: s1, s2, s3, s4, s5, s6$/)).toBeTruthy();

    fireEvent.click(within(row).getByRole('button'));
    expect(within(row).getByText(/mail: s1, s2, s3, s4, \+2/)).toBeTruthy();
  });

  it('offers no expand button when no permission exceeds the preview length', async () => {
    listAdaptors.mockResolvedValue([
      adaptor({ permissions: [perm({ scopes: ['a', 'b', 'c'] })] }),
    ]);
    const row = (renderSection(), await screen.findByRole('listitem'));
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('falls back to the empty state if listing rejects', async () => {
    listAdaptors.mockRejectedValue(new Error('registry down'));
    renderSection();
    await waitFor(() => expect(listAdaptors).toHaveBeenCalled());
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});
