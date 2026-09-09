// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { RoomBrowser } from './RoomBrowser';
import type { RoomListing } from './room-browser';

afterEach(cleanup);

const wrap = (ui: ReactElement) => render(<I18nProvider locale="en">{ui}</I18nProvider>);

function room(over: Partial<RoomListing> = {}): RoomListing {
  return {
    jid: 'general@conf.example',
    name: 'General',
    description: null,
    occupants: null,
    passwordProtected: false,
    membersOnly: false,
    ...over,
  };
}

describe('RoomBrowser', () => {
  it('browses a service, lists + filters rooms, and joins one', async () => {
    const discoverRooms = vi.fn<(s: string) => Promise<RoomListing[]>>(() =>
      Promise.resolve([
        room({ jid: 'general@conf.example', name: 'General', occupants: 12 }),
        room({ jid: 'random@conf.example', name: 'Random', occupants: 3, passwordProtected: true }),
      ]),
    );
    const onJoin = vi.fn();
    wrap(<RoomBrowser discoverRooms={discoverRooms} onJoin={onJoin} defaultService="conf.example" />);

    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    expect(discoverRooms).toHaveBeenCalledWith('conf.example');

    await screen.findByText('General');
    expect(screen.getByText('Password required')).toBeDefined();
    // most-populated first
    const names = screen.getAllByText(/General|Random/).map((n) => n.textContent);
    expect(names[0]).toBe('General');

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'random' } });
    expect(screen.queryByText('General')).toBeNull();

    fireEvent.click(screen.getByText('Random'));
    expect(onJoin).toHaveBeenCalledWith('random@conf.example');
  });

  it('renders the members-only flag and a description', async () => {
    wrap(
      <RoomBrowser
        discoverRooms={() =>
          Promise.resolve([
            room({ jid: 'club@conf.example', name: 'Club', membersOnly: true, description: 'invite only' }),
          ])
        }
        onJoin={vi.fn()}
        defaultService="conf.example"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    await screen.findByText('Club');
    expect(screen.getByText('Members only')).toBeDefined();
    expect(screen.getByText('invite only')).toBeDefined();
  });

  it('shows the empty state when discovery returns nothing', async () => {
    wrap(
      <RoomBrowser
        discoverRooms={() => Promise.resolve([])}
        onJoin={vi.fn()}
        defaultService="conf.example"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    await screen.findByText('No rooms found');
  });

  it('shows the empty state when discovery fails', async () => {
    wrap(
      <RoomBrowser
        discoverRooms={() => Promise.reject(new Error('unreachable'))}
        onJoin={vi.fn()}
        defaultService="conf.example"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    await screen.findByText('No rooms found');
  });

  it('joins by raw address and clears the field', () => {
    const onJoin = vi.fn();
    wrap(<RoomBrowser discoverRooms={() => Promise.resolve([])} onJoin={onJoin} />);
    const input = screen.getByLabelText('Join by address');
    fireEvent.change(input, { target: { value: '  room@conf.example  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(onJoin).toHaveBeenCalledWith('room@conf.example');
    expect(input).toHaveProperty('value', '');
  });

  it('does not browse an empty service', () => {
    const discoverRooms = vi.fn(() => Promise.resolve([]));
    wrap(<RoomBrowser discoverRooms={discoverRooms} onJoin={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Browse' })).toHaveProperty('disabled', true);
  });
});
