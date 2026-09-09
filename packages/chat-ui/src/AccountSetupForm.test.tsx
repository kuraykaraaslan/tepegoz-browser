// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { AccountSetupForm, type AccountSetupResult } from './AccountSetupForm';

type OnAdd = (result: AccountSetupResult) => void;

afterEach(cleanup);

const wrap = (ui: ReactElement) => render(<I18nProvider locale="en">{ui}</I18nProvider>);

function fill(labels: { label: string; jid: string; password: string }) {
  fireEvent.change(screen.getByLabelText('Account name'), { target: { value: labels.label } });
  fireEvent.change(screen.getByLabelText('Jabber ID (JID)'), { target: { value: labels.jid } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: labels.password } });
}

describe('AccountSetupForm', () => {
  it('blocks submit and shows field errors for an empty form', () => {
    const onAdd = vi.fn();
    wrap(<AccountSetupForm onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText('Give the account a name.')).toBeDefined();
    expect(screen.getByText('Enter your Jabber ID.')).toBeDefined();
    expect(screen.getByText('Enter your password.')).toBeDefined();
  });

  it('submits a valid account (id derived from the label) with the secret once', () => {
    const onAdd = vi.fn<OnAdd>();
    wrap(<AccountSetupForm onAdd={onAdd} />);
    fill({ label: 'Work Chat', jid: 'ada@example.org', password: 'pencil' });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    const [arg] = onAdd.mock.calls.at(0) ?? [];
    expect(arg).toMatchObject({
      account: {
        id: 'work-chat',
        label: 'Work Chat',
        server: { protocol: 'xmpp', jid: 'ada@example.org' },
      },
      secret: 'pencil',
    });
  });

  it('reveals the advanced fields on toggle and carries them through', () => {
    const onAdd = vi.fn<OnAdd>();
    wrap(<AccountSetupForm onAdd={onAdd} />);
    fill({ label: 'W', jid: 'a@b.org', password: 'p' });
    fireEvent.click(screen.getByRole('button', { name: 'Connection settings' }));
    fireEvent.change(screen.getByLabelText('Port'), { target: { value: '5223' } });
    fireEvent.change(screen.getByLabelText('Security'), { target: { value: 'starttls' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    const [arg] = onAdd.mock.calls.at(0) ?? [];
    expect(arg).toMatchObject({ account: { server: { port: 5223, security: 'starttls' } } });
  });

  it('shows the port error and does not submit', () => {
    const onAdd = vi.fn();
    wrap(<AccountSetupForm onAdd={onAdd} />);
    fill({ label: 'W', jid: 'a@b.org', password: 'p' });
    fireEvent.click(screen.getByRole('button', { name: 'Connection settings' }));
    fireEvent.change(screen.getByLabelText('Port'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText('Port must be a number between 1 and 65535.')).toBeDefined();
  });

  it('calls onCancel and disables actions while busy', () => {
    const onCancel = vi.fn();
    wrap(<AccountSetupForm onAdd={vi.fn()} onCancel={onCancel} busy />);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveProperty('disabled', true);
    // not disabled variant
    cleanup();
    wrap(<AccountSetupForm onAdd={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('localizes to Turkish', () => {
    wrap(<AccountSetupForm onAdd={vi.fn()} />);
    cleanup();
    render(
      <I18nProvider locale="tr">
        <AccountSetupForm onAdd={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole('heading', { name: 'XMPP hesabı ekle' })).toBeDefined();
  });
});
