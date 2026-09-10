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

  it('shows the notify-level picker only with a handler, and reports a change', () => {
    const { rerender } = wrap(
      <RoomHeader name="r" membersOpen onToggleMembers={vi.fn()} notifyLevel="mentions" />,
    );
    expect(screen.queryByLabelText('Notifications')).toBeNull();

    const onSetNotifyLevel = vi.fn();
    rerender(
      <I18nProvider locale="en">
        <RoomHeader
          name="r"
          membersOpen
          onToggleMembers={vi.fn()}
          notifyLevel="mentions"
          onSetNotifyLevel={onSetNotifyLevel}
        />
      </I18nProvider>,
    );
    const picker = screen.getByLabelText('Notifications');
    expect(picker).toHaveProperty('value', 'mentions');
    fireEvent.change(picker, { target: { value: 'none' } });
    expect(onSetNotifyLevel).toHaveBeenCalledWith('none');
  });

  it('shows the mute toggle only with a handler and reflects the muted state', () => {
    const { rerender } = wrap(<RoomHeader name="r" membersOpen onToggleMembers={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Mute|Unmute/ })).toBeNull();

    const onToggleMuted = vi.fn();
    rerender(
      <I18nProvider locale="en">
        <RoomHeader name="r" membersOpen onToggleMembers={vi.fn()} muted onToggleMuted={onToggleMuted} />
      </I18nProvider>,
    );
    const btn = screen.getByRole('button', { name: 'Unmute' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn);
    expect(onToggleMuted).toHaveBeenCalled();
  });

  it('shows the "not encrypted" marker only when the room protocol has no E2EE', () => {
    const { rerender } = wrap(<RoomHeader name="r" membersOpen onToggleMembers={vi.fn()} />);
    expect(screen.queryByText('Not encrypted')).toBeNull();
    rerender(
      <I18nProvider locale="en">
        <RoomHeader name="r" membersOpen onToggleMembers={vi.fn()} notEncrypted />
      </I18nProvider>,
    );
    expect(screen.getByText('Not encrypted')).toBeDefined();
  });

  it('edits the topic: reveal input, commit on Enter, skip when unchanged, cancel on Escape', () => {
    const onSetTopic = vi.fn();
    wrap(
      <RoomHeader
        name="r"
        topicFallback="old topic"
        membersOpen
        onToggleMembers={vi.fn()}
        onSetTopic={onSetTopic}
      />,
    );
    // no editor without a click
    expect(screen.queryByLabelText('Edit topic')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Edit topic' }));
    const input = screen.getByLabelText('Edit topic');
    expect(input).toHaveProperty('value', 'old topic');

    fireEvent.change(input, { target: { value: 'brand new topic' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSetTopic).toHaveBeenCalledWith('brand new topic');

    // re-open, leave unchanged, Enter → no extra call
    fireEvent.click(screen.getByRole('button', { name: 'Edit topic' }));
    fireEvent.keyDown(screen.getByLabelText('Edit topic'), { key: 'Enter' });
    expect(onSetTopic).toHaveBeenCalledTimes(1);

    // re-open, type, Escape → no call, editor closes
    fireEvent.click(screen.getByRole('button', { name: 'Edit topic' }));
    fireEvent.change(screen.getByLabelText('Edit topic'), { target: { value: 'discarded' } });
    fireEvent.keyDown(screen.getByLabelText('Edit topic'), { key: 'Escape' });
    expect(onSetTopic).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Edit topic')).toBeNull();
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
