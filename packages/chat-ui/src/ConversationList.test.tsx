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
    mutedUntil: null,
    notifyLevel: 'all',
    isKnownContact: true,
    archived: false,
    lastMessage: null,
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

  it('stays one flat, recency-ordered list across multiple accounts — no grouping headers', () => {
    renderList(
      <ConversationList
        conversations={[
          conv({ id: 'w1', name: 'W1', accountId: 'work', updatedAt: 1 }),
          conv({ id: 'h1', name: 'H1', accountId: 'home', updatedAt: 2 }),
        ]}
        accounts={[
          { id: 'work', label: 'Work', color: '#4477aa' },
          { id: 'home', label: 'Home' },
        ]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.querySelector('.chat-conv__title')?.textContent)).toEqual([
      'H1',
      'W1',
    ]);
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

  it('badges each row with its owning account’s protocol — the single-account row too', () => {
    renderList(
      <ConversationList
        conversations={[conv({ id: 'c1', name: 'Bob' })]}
        accounts={[{ id: 'work', label: 'Work', protocol: 'xmpp' }]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('button').querySelector('.chat-protocol-badge')?.getAttribute('data-protocol')).toBe(
      'xmpp',
    );
  });

  it('badges rows by the right account across a grouped, multi-protocol roster', () => {
    renderList(
      <ConversationList
        conversations={[
          conv({ id: 'w1', name: 'W1', accountId: 'work' }),
          conv({ id: 'h1', name: 'H1', accountId: 'home' }),
        ]}
        accounts={[
          { id: 'work', label: 'Work', protocol: 'xmpp' },
          { id: 'home', label: 'Home', protocol: 'irc' },
        ]}
        onSelect={vi.fn()}
      />,
    );
    const w1 = screen.getByText('W1').closest('button');
    const h1 = screen.getByText('H1').closest('button');
    expect(w1?.querySelector('.chat-protocol-badge')?.getAttribute('data-protocol')).toBe('xmpp');
    expect(h1?.querySelector('.chat-protocol-badge')?.getAttribute('data-protocol')).toBe('irc');
  });

  it('shows a one-line last-message preview and its time, when there is one', () => {
    const T0 = new Date(2026, 2, 15, 14, 5, 0).getTime();
    renderList(
      <ConversationList
        conversations={[
          conv({
            id: 'c1',
            name: 'Bob',
            lastMessage: {
              protocolId: 'p1',
              body: 'see you at 5',
              senderAddress: 'bob@x.example',
              kind: 'text',
              redacted: false,
              originTs: T0,
            },
          }),
        ]}
        accounts={[{ id: 'work', label: 'Work' }]}
        onSelect={vi.fn()}
        now={T0}
      />,
    );
    expect(screen.getByText('see you at 5')).toBeDefined();
    expect(screen.getByRole('button').querySelector('.chat-conv__time')?.textContent).toMatch(/2:05/);
  });

  it('shows no preview line for a brand-new conversation with no messages yet', () => {
    renderList(
      <ConversationList
        conversations={[conv({ id: 'c1', name: 'Bob', lastMessage: null })]}
        accounts={[{ id: 'work', label: 'Work' }]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('button').querySelector('.chat-conv__preview')).toBeNull();
    expect(screen.getByRole('button').querySelector('.chat-conv__time')).toBeNull();
  });

  it('a redacted last message previews as the redacted placeholder, not its (empty, stale) body', () => {
    renderList(
      <ConversationList
        conversations={[
          conv({
            id: 'c1',
            name: 'Bob',
            lastMessage: {
              protocolId: 'p1',
              body: '',
              senderAddress: 'bob@x.example',
              kind: 'text',
              redacted: true,
              originTs: 1,
            },
          }),
        ]}
        accounts={[{ id: 'work', label: 'Work' }]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('Message deleted')).toBeDefined();
  });

  it('omits the badge when the owning account carries no protocol', () => {
    renderList(
      <ConversationList
        conversations={[conv({ id: 'c1', name: 'Bob' })]}
        accounts={[{ id: 'work', label: 'Work' }]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('button').querySelector('.chat-protocol-badge')).toBeNull();
  });
});
