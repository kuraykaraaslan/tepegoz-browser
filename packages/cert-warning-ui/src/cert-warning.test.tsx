// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { CertWarning } from './cert-warning';

function renderWarning(over: Partial<Parameters<typeof CertWarning>[0]> = {}) {
  const props = {
    origin: 'https://self-signed.example.com',
    errorCode: 'net::ERR_CERT_AUTHORITY_INVALID',
    issuer: 'Acme Internal CA',
    expiry: '2027-01-01T00:00:00.000Z',
    onBack: vi.fn(),
    onProceed: vi.fn(),
    ...over,
  };
  render(
    <I18nProvider locale="en">
      <CertWarning {...props} />
    </I18nProvider>,
  );
  return props;
}

afterEach(cleanup);

describe('CertWarning', () => {
  it('names the origin and the concrete consequence, not just the error category', () => {
    renderWarning();
    expect(screen.getByText('https://self-signed.example.com')).toBeTruthy();
    expect(
      screen.getByText('Someone could be reading or changing what you send to this site.'),
    ).toBeTruthy();
  });

  it('shows the certificate details as evidence', () => {
    renderWarning();
    expect(screen.getByText('net::ERR_CERT_AUTHORITY_INVALID')).toBeTruthy();
    expect(screen.getByText('Acme Internal CA')).toBeTruthy();
  });

  it('focuses the safe action, so a stray Enter goes back rather than through', () => {
    renderWarning();
    expect(document.activeElement).toBe(screen.getByText('Go back (recommended)'));
  });

  it('tells the user how long proceeding lasts', () => {
    renderWarning();
    expect(screen.getByText('This choice applies until you restart the browser.')).toBeTruthy();
  });

  it('reports going back', () => {
    const props = renderWarning();
    fireEvent.click(screen.getByText('Go back (recommended)'));
    expect(props.onBack).toHaveBeenCalledTimes(1);
    expect(props.onProceed).not.toHaveBeenCalled();
  });

  it('reports proceeding', () => {
    const props = renderWarning();
    fireEvent.click(screen.getByText('Continue anyway'));
    expect(props.onProceed).toHaveBeenCalledTimes(1);
  });
});
