// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { applyOccupant, emptyRoom, type RoomOccupantUpdate } from '@tepegoz/chat-core';
import { RoomMemberList } from './RoomMemberList';

afterEach(cleanup);

const wrap = (ui: ReactElement) => render(<I18nProvider locale="en">{ui}</I18nProvider>);

function occ(over: Partial<RoomOccupantUpdate>): RoomOccupantUpdate {
  return {
    nick: 'x',
    realJid: null,
    affiliation: 'member',
    role: 'participant',
    presence: 'online',
    statusText: '',
    self: false,
    ...over,
  };
}

function roomWith(...updates: Partial<RoomOccupantUpdate>[]) {
  return updates.reduce((room, u) => applyOccupant(room, occ(u)), emptyRoom());
}

describe('RoomMemberList', () => {
  it('lists members role-ranked with a count and the right badges', () => {
    const room = roomWith(
      { nick: 'zoe', role: 'participant' },
      { nick: 'ada', affiliation: 'owner', role: 'moderator' },
      { nick: 'bea', role: 'moderator' },
      { nick: 'cem', affiliation: 'admin', role: 'participant' },
    );
    wrap(<RoomMemberList room={room} />);
    expect(screen.getByRole('heading', { name: '4 Members' })).toBeDefined();

    const nicks = screen.getAllByRole('button').map((b) => b.querySelector('.chat-room-members__nick')?.textContent);
    expect(nicks).toEqual(['ada', 'bea', 'cem', 'zoe']);

    const adaRow = screen.getByText('ada').closest('button');
    expect(adaRow?.querySelector('.chat-room-members__badge')?.textContent).toBe('Owner');
    expect(screen.getByText('bea').closest('button')?.querySelector('.chat-room-members__badge')?.textContent).toBe('Mod');
    expect(screen.getByText('cem').closest('button')?.querySelector('.chat-room-members__badge')?.textContent).toBe('Admin');
    expect(screen.getByText('zoe').closest('button')?.querySelector('.chat-room-members__badge')).toBeNull();
  });

  it('calls onSelectMember on click; the pick is disabled without a handler', () => {
    const onSelectMember = vi.fn();
    const room = roomWith({ nick: 'ada' });
    const { rerender } = wrap(<RoomMemberList room={room} onSelectMember={onSelectMember} />);
    fireEvent.click(screen.getByText('ada'));
    expect(onSelectMember).toHaveBeenCalledWith('ada');

    rerender(
      <I18nProvider locale="en">
        <RoomMemberList room={room} />
      </I18nProvider>,
    );
    expect(screen.getByText('ada').closest('button')).toHaveProperty('disabled', true);
  });
});
