// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { Profile } from '@tepegoz/profiles';
import { ProfilesPage } from './profiles-page';

function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: 'default',
    name: 'Ada',
    colorId: 0,
    createdAt: 1,
    lastUsedAt: 1,
    ...over,
  };
}

function renderPage(over: Partial<Parameters<typeof ProfilesPage>[0]> = {}) {
  const props = {
    list: vi.fn(() =>
      Promise.resolve([profile(), profile({ id: 'profile-1', name: 'Bob', colorId: 1 })]),
    ),
    getActive: vi.fn(() => Promise.resolve<Profile | null>(profile())),
    create: vi.fn(() => Promise.resolve(profile({ id: 'profile-2', name: 'Profile 3' }))),
    rename: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    switchTo: vi.fn(() => Promise.resolve()),
    ...over,
  };
  render(
    <I18nProvider locale="en">
      <ProfilesPage {...props} />
    </I18nProvider>,
  );
  return props;
}

afterEach(cleanup);

describe('ProfilesPage', () => {
  it('lists every profile and marks the active one', async () => {
    renderPage();
    expect(await screen.findByText('Ada')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Current')).toBeTruthy();
  });

  it('switches to another profile but never offers to switch to the active one', async () => {
    const props = renderPage();
    await screen.findByText('Bob');
    const switchButtons = screen.getAllByText('Switch to this profile');
    expect(switchButtons).toHaveLength(1); // only Bob, not Ada
    fireEvent.click(switchButtons[0]!);
    expect(props.switchTo).toHaveBeenCalledWith('profile-1');
  });

  it('renames a profile through the inline editor', async () => {
    const props = renderPage();
    await screen.findByText('Ada');
    fireEvent.click(screen.getAllByText('Rename')[0]!);
    const input = screen.getByDisplayValue('Ada');
    fireEvent.change(input, { target: { value: 'Ada L.' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.rename).toHaveBeenCalledWith({ id: 'default', name: 'Ada L.' });
  });

  it('requires a confirm step before deleting', async () => {
    const props = renderPage();
    await screen.findByText('Bob');
    fireEvent.click(screen.getAllByText('Delete')[0]!);
    expect(props.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Delete profile'));
    expect(props.remove).toHaveBeenCalledWith('default');
  });

  it('surfaces the last-profile error when a delete is rejected', async () => {
    const props = renderPage({
      remove: vi.fn(() => Promise.reject(new Error('nope'))),
    });
    await screen.findByText('Ada');
    fireEvent.click(screen.getAllByText('Delete')[0]!);
    fireEvent.click(screen.getByText('Delete profile'));
    await waitFor(() => expect(props.remove).toHaveBeenCalled());
    expect(await screen.findByText(/only profile/i)).toBeTruthy();
  });

  it('adds a profile', async () => {
    const props = renderPage();
    await screen.findByText('Ada');
    fireEvent.click(screen.getByText('Add profile'));
    await waitFor(() => expect(props.create).toHaveBeenCalled());
  });
});
