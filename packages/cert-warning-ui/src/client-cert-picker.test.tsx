// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { ClientCertPicker } from './client-cert-picker';

/**
 * The chooser's job is to make "send nothing" the easy answer, because the behaviour it replaces was
 * Electron sending the FIRST certificate in the OS store with no prompt at all. A picker that
 * pre-selected one and offered "OK" would be the same defect with a dialog in front of it — so the
 * ordering and the default focus are behaviour here, not styling.
 */
const OPTIONS = [
  { index: 0, subject: 'Ada Lovelace', issuer: 'Test CA', expiry: '2030-01-01T00:00:00.000Z' },
  {
    index: 1,
    subject: 'Ada Lovelace (work)',
    issuer: 'Corp CA',
    expiry: '2031-01-01T00:00:00.000Z',
  },
];

function renderPicker() {
  const onChoose = vi.fn();
  render(
    <I18nProvider locale="en">
      <ClientCertPicker
        origin="https://intranet.example.com"
        options={OPTIONS}
        onChoose={onChoose}
      />
    </I18nProvider>,
  );
  return onChoose;
}

afterEach(cleanup);

describe('ClientCertPicker', () => {
  it('puts the refusal first and focuses it, so the safe answer is the default one', () => {
    renderPicker();
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]?.textContent).toBe('Do not send a certificate (recommended)');
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('sends null when the user declines', () => {
    const onChoose = renderPicker();
    fireEvent.click(screen.getByText('Do not send a certificate (recommended)'));
    expect(onChoose).toHaveBeenCalledWith(null);
  });

  it('sends the INDEX of the certificate the user picked, never the certificate', () => {
    const onChoose = renderPicker();
    fireEvent.click(screen.getByText('Ada Lovelace (work)'));
    expect(onChoose).toHaveBeenCalledWith(1);
  });

  it('names the origin and each identity on offer — that is what the choice is about', () => {
    renderPicker();
    expect(screen.getByText('https://intranet.example.com')).toBeTruthy();
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText(/Corp CA/)).toBeTruthy();
  });

  it('says how long the choice lasts before it is made', () => {
    renderPicker();
    expect(
      screen.getByText('This choice applies to this site until you restart the browser.'),
    ).toBeTruthy();
  });
});
