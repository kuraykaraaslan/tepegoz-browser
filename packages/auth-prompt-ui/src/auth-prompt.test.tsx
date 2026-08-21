// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { AuthPrompt } from './auth-prompt';

function renderPrompt(over: Partial<Parameters<typeof AuthPrompt>[0]> = {}) {
  const props = {
    origin: 'https://intranet.example.com',
    realm: 'Staff area',
    isProxy: false,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    ...over,
  };
  render(
    <I18nProvider locale="en">
      <AuthPrompt {...props} />
    </I18nProvider>,
  );
  return props;
}

afterEach(cleanup);

describe('AuthPrompt', () => {
  it('shows the challenging origin, the user\u2019s only phishing defence', () => {
    renderPrompt();
    expect(screen.getByText('https://intranet.example.com')).toBeTruthy();
  });

  it('says so when a PROXY is asking rather than the site', () => {
    renderPrompt({ isProxy: true });
    expect(
      screen.getByText('A network proxy is asking for these credentials, not the website.'),
    ).toBeTruthy();
  });

  it('does not claim a proxy is involved for an ordinary site challenge', () => {
    renderPrompt();
    expect(screen.queryByText(/network proxy/)).toBeNull();
  });

  it('shows the server realm, labelled, so it cannot pass as app text', () => {
    renderPrompt();
    expect(screen.getByText('Realm: Staff area')).toBeTruthy();
  });

  it('omits the realm line when the server sent none', () => {
    renderPrompt({ realm: '' });
    expect(screen.queryByText(/Realm/)).toBeNull();
  });

  it('masks the password field', () => {
    renderPrompt();
    expect(screen.getByLabelText('Password').getAttribute('type')).toBe('password');
  });

  it('hands both values back on submit', () => {
    const props = renderPrompt();
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ada' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByText('Sign in', { selector: 'button' }));
    expect(props.onSubmit).toHaveBeenCalledWith('ada', 'hunter2');
  });

  it('cancels without handing anything back', () => {
    const props = renderPrompt();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByText('Cancel'));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
});
