// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import type { LoginCredentialMeta, LoginImportResult } from '@tepegoz/desktop-ipc';
import { PasswordsSection } from './settings-privacy-files';

/**
 * `settings-privacy-files.tsx` is now mostly re-exports; the one component it still owns is
 * `PasswordsSection` — a thin host that fetches the credential list once on mount and threads the
 * bridge callbacks into `@tepegoz/password-ui`. The wiring is all this needs to pin: it mounts, it
 * calls `onMount`, and the "add credential" path reaches `onAdd`.
 */

const s = settingsDict.en;

function renderSection(credentials: LoginCredentialMeta[] = []) {
  const props = {
    credentials,
    onMount: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    onAdd: vi.fn<(c: unknown) => Promise<void>>(() => Promise.resolve()),
    onRemove: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
    onImport: vi.fn<(data: string, format: string) => Promise<LoginImportResult>>(() =>
      Promise.resolve({ imported: 0, skipped: 0, errors: [] }),
    ),
    onExport: vi.fn<(format: string) => Promise<string>>(() => Promise.resolve('')),
  };
  render(
    <I18nProvider locale="en">
      <PasswordsSection {...props} />
    </I18nProvider>,
  );
  return props;
}

afterEach(cleanup);

describe('PasswordsSection', () => {
  it('fetches the credential list once when it mounts and renders the card', async () => {
    const props = renderSection();
    await waitFor(() => expect(props.onMount).toHaveBeenCalledTimes(1));
    expect(screen.getByText(s.passwordsTitle)).toBeTruthy();
  });

  it('threads a new credential through to onAdd', async () => {
    const props = renderSection();
    await waitFor(() => expect(props.onMount).toHaveBeenCalled());

    // open the add form (password-ui labels the trigger "Add password")
    fireEvent.click(screen.getByRole('button', { name: /add password|parola ekle/i }));
    fireEvent.change(screen.getByPlaceholderText(/website|web sitesi/i), {
      target: { value: 'https://site.example' },
    });
    fireEvent.change(screen.getByPlaceholderText(/^username|kullanıcı adı/i), {
      target: { value: 'alice' },
    });
    const pw = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(pw, { target: { value: 'hunter2' } });

    fireEvent.click(screen.getByRole('button', { name: /^save$|^kaydet$/i }));
    await waitFor(() =>
      expect(props.onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://site.example', username: 'alice', password: 'hunter2' }),
      ),
    );
  });
});
