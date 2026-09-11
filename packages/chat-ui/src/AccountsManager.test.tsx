// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { AccountsManager } from './AccountsManager';
import type { ChatAccountSummary } from './types';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) => render(<I18nProvider locale="en">{ui}</I18nProvider>);

function account(over: Partial<ChatAccountSummary> = {}): ChatAccountSummary {
  return { id: 'work', label: 'Work', displayName: '', protocol: 'xmpp', color: null, order: 0, ...over };
}

describe('AccountsManager', () => {
  it('lists every configured account with its live connection state', () => {
    wrap(
      <AccountsManager
        accounts={[account(), account({ id: 'home', label: 'Home' })]}
        connectionStates={{ work: 'online', home: 'reconnecting' }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Work')).toBeDefined();
    expect(screen.getByText('Connected')).toBeDefined();
    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('Reconnecting…')).toBeDefined();
  });

  it('badges each account row with its protocol', () => {
    wrap(
      <AccountsManager
        accounts={[account({ id: 'work', protocol: 'xmpp' }), account({ id: 'home', label: 'Home', protocol: 'matrix' })]}
        connectionStates={{}}
        onClose={vi.fn()}
      />,
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]?.querySelector('.chat-protocol-badge')?.getAttribute('data-protocol')).toBe('xmpp');
    expect(rows[1]?.querySelector('.chat-protocol-badge')?.getAttribute('data-protocol')).toBe('matrix');
  });

  it('shows an empty state with no accounts', () => {
    wrap(<AccountsManager accounts={[]} connectionStates={{}} onClose={vi.fn()} />);
    expect(screen.getByText('No accounts yet.')).toBeDefined();
  });

  it('hides the add button without onAdd, and calls it when present', () => {
    const onAdd = vi.fn();
    wrap(<AccountsManager accounts={[]} connectionStates={{}} onClose={vi.fn()} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(onAdd).toHaveBeenCalled();

    cleanup();
    wrap(<AccountsManager accounts={[]} connectionStates={{}} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Add account' })).toBeNull();
  });

  it('hides remove buttons without onRemove, and requires two clicks when present', () => {
    const onRemove = vi.fn();
    wrap(
      <AccountsManager
        accounts={[account()]}
        connectionStates={{ work: 'online' }}
        onClose={vi.fn()}
        onRemove={onRemove}
      />,
    );
    const remove = screen.getByRole('button', { name: 'Remove' });
    fireEvent.click(remove);
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Click again to remove' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Click again to remove' }));
    expect(onRemove).toHaveBeenCalledWith('work');

    cleanup();
    wrap(<AccountsManager accounts={[account()]} connectionStates={{}} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('calls onClose from the back button', () => {
    const onClose = vi.fn();
    wrap(<AccountsManager accounts={[]} connectionStates={{}} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onClose).toHaveBeenCalled();
  });
});
