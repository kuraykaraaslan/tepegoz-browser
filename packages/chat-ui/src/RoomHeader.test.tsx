// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { applyOccupant, applySubject, emptyRoom, type RoomOccupantUpdate } from '@tepegoz/chat-core';
import { RoomHeader } from './RoomHeader';

afterEach(cleanup);

const wrap = (ui: ReactElement) => render(<I18nProvider locale="en">{ui}</I18nProvider>);

function occ(nick: string): RoomOccupantUpdate {
  return {
    nick,
    realJid: null,
    affiliation: 'member',
    role: 'participant',
    presence: 'online',
    statusText: '',
    self: false,
  };
}

describe('RoomHeader', () => {
  it('shows the live subject + occupant count and toggles members', () => {
    let room = applySubject(emptyRoom(), 'Weekly sync');
    room = applyOccupant(applyOccupant(room, occ('ada')), occ('bea'));
    const onToggleMembers = vi.fn();
    wrap(
      <RoomHeader
        name="general"
        room={room}
        membersOpen={false}
        onToggleMembers={onToggleMembers}
      />,
    );
    expect(screen.getByRole('heading', { name: 'general' })).toBeDefined();
    expect(screen.getByText('Weekly sync')).toBeDefined();
    const toggle = screen.getByRole('button', { name: '2 Members' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(onToggleMembers).toHaveBeenCalled();
  });

  it('falls back to the stored topic, then to a placeholder', () => {
    const { rerender } = wrap(
      <RoomHeader name="r" topicFallback="stored topic" membersOpen onToggleMembers={vi.fn()} />,
    );
    expect(screen.getByText('stored topic')).toBeDefined();
    rerender(
      <I18nProvider locale="en">
        <RoomHeader name="r" membersOpen onToggleMembers={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByText('No topic')).toBeDefined();
  });
});
