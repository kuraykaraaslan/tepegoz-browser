// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { ChatConversation } from '@tepegoz/shared-types';
import { ConversationList } from './ConversationList';

afterEach(cleanup);

function conv(over: Partial<ChatConversation> = {}): ChatConversation {
  return {
    id: 'c1',
    accountId: 'work',
    kind: 'dm',
    address: 'bob@x.example',
    name: '',
    topic: '',
    memberCount: 2,
    unread: 0,
    mentions: 0,
    lastReadId: null,
    muted: false,
    notifyLevel: 'all',
    isKnownContact: true,
    updatedAt: 1000,
    ...over,
  };
}

function renderList(ui: ReactElement) {
  return render(<I18nProvider locale="en">{ui}</I18nProvider>);
}

describe('ConversationList', () => {
  it('shows the empty state when there are no conversations', () => {
    renderList(<ConversationList conversations={[]} accounts={[]} onSelect={vi.fn()} />);
    expect(screen.getByText('No conversations yet')).toBeDefined();
  });

  it('renders rows recency-first and reports the clicked id', () => {
    const onSelect = vi.fn();
    renderList(
      <ConversationList
        conversations={[
          conv({ id: 'old', name: 'Old', updatedAt: 1 }),
          conv({ id: 'new', name: 'New', updatedAt: 9 }),
        ]}
        accounts={[{ id: 'work', label: 'Work' }]}
        onSelect={onSelect}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['New', 'Old']);
    buttons[1]?.click();
    expect(onSelect).toHaveBeenCalledWith('old');
  });

  it('marks the selected row with aria-current and badges unread + mentions', () => {
    renderList(
      <ConversationList
        conversations={[conv({ id: 'c1', name: 'Room', kind: 'room', unread: 128, mentions: 2 })]}
        accounts={[{ id: 'work', label: 'Work' }]}
        selectedId="c1"
        onSelect={vi.fn()}
      />,
    );
    const row = screen.getByRole('button');
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(within(row).getByLabelText('2 mentions')).toBeDefined();
    // capped display
    expect(within(row).getByLabelText('128 unread').textContent).toBe('99+');
  });

  it('shows the muted marker with a localized title', () => {
    renderList(
      <ConversationList
        conversations={[conv({ id: 'c1', name: 'Quiet', muted: true })]}
        accounts={[{ id: 'work', label: 'Work' }]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('button').querySelector('.chat-conv__muted')?.getAttribute('title')).toBe(
      'Muted',
    );
  });

  it('groups under account headers when there is more than one account', () => {
    renderList(
      <ConversationList
        conversations={[
          conv({ id: 'w1', name: 'W1', accountId: 'work' }),
          conv({ id: 'h1', name: 'H1', accountId: 'home' }),
        ]}
        accounts={[
          { id: 'work', label: 'Work', color: '#4477aa' },
          { id: 'home', label: 'Home' },
        ]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Work' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Home' })).toBeDefined();
  });

  it('renders a presence dot for DMs when presenceOf resolves one', () => {
    renderList(
      <ConversationList
        conversations={[conv({ id: 'c1', name: 'Bob' })]}
        accounts={[{ id: 'work', label: 'Work' }]}
        onSelect={vi.fn()}
        presenceOf={() => 'online'}
      />,
    );
    expect(screen.getByText('Online')).toBeDefined();
  });
});
