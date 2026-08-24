import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
const focusedWindow = vi.fn();

vi.mock('../tabs', () => ({
  default: {
    focusedWindow: () => focusedWindow() as unknown,
  },
}));
vi.mock('@tepegoz/libs', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const journalProceed = vi.fn();
vi.mock('./certificate-journal', () => ({
  journalCertificateProceed: (...a: unknown[]): void => {
    journalProceed(...a);
  },
}));

const { clearCertificateExceptions, decideCertificateError, resolveCertificateError } =
  await import('./certificate-broker');

/** A live chrome window that records what main pushes to the renderer. */
function windowThatPrompts() {
  return { isDestroyed: () => false, webContents: { send } };
}

/** Answer whatever challenge main just pushed. */
function answerLastPrompt(proceed: boolean): void {
  const [, request] = send.mock.calls.at(-1) as [string, { requestId: string }];
  resolveCertificateError({ requestId: request.requestId, proceed });
}

const BAD_CERT = {
  url: 'https://self-signed.example.com/',
  errorCode: 'net::ERR_CERT_AUTHORITY_INVALID',
  issuer: 'Acme Internal CA',
  expiry: '2027-01-01T00:00:00.000Z',
};

beforeEach(() => {
  send.mockClear();
  focusedWindow.mockReset();
  clearCertificateExceptions();
});

describe('decideCertificateError', () => {
  it('refuses when there is no window to ask in, rather than proceeding unattended', async () => {
    focusedWindow.mockReturnValue(null);
    await expect(decideCertificateError(BAD_CERT)).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('prompts and honours a refusal', async () => {
    focusedWindow.mockReturnValue(windowThatPrompts());
    const decision = decideCertificateError(BAD_CERT);
    answerLastPrompt(false);
    await expect(decision).resolves.toBe(false);
  });

  it('proceeds when the user explicitly says so', async () => {
    focusedWindow.mockReturnValue(windowThatPrompts());
    const decision = decideCertificateError(BAD_CERT);
    answerLastPrompt(true);
    await expect(decision).resolves.toBe(true);
  });

  it('hard-blocks a sensitive site WITHOUT offering the choice at all', async () => {
    focusedWindow.mockReturnValue(windowThatPrompts());
    await expect(
      decideCertificateError({ ...BAD_CERT, url: 'https://www.garantibbva.com.tr/hesap' }),
    ).resolves.toBe(false);
    // The point is not just the refusal — no prompt may be shown, or the habit gets taught.
    expect(send).not.toHaveBeenCalled();
  });

  it('remembers an accepted origin for the rest of the run instead of re-asking every request', async () => {
    focusedWindow.mockReturnValue(windowThatPrompts());
    const first = decideCertificateError(BAD_CERT);
    answerLastPrompt(true);
    await first;

    send.mockClear();
    await expect(decideCertificateError(BAD_CERT)).resolves.toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it('does not carry an exception across origins', async () => {
    focusedWindow.mockReturnValue(windowThatPrompts());
    const first = decideCertificateError(BAD_CERT);
    answerLastPrompt(true);
    await first;

    send.mockClear();
    const second = decideCertificateError({ ...BAD_CERT, url: 'https://other.example.org/' });
    expect(send).toHaveBeenCalledTimes(1); // a fresh prompt, not the stored answer
    answerLastPrompt(false);
    await expect(second).resolves.toBe(false);
  });

  it('does not remember a refusal, so a transient error can be retried', async () => {
    focusedWindow.mockReturnValue(windowThatPrompts());
    const first = decideCertificateError(BAD_CERT);
    answerLastPrompt(false);
    await first;

    send.mockClear();
    const second = decideCertificateError(BAD_CERT);
    expect(send).toHaveBeenCalledTimes(1);
    answerLastPrompt(false);
    await second;
  });

  it('passes the certificate details through to the prompt', async () => {
    focusedWindow.mockReturnValue(windowThatPrompts());
    const decision = decideCertificateError(BAD_CERT);
    const [, request] = send.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(request).toMatchObject({
      origin: 'https://self-signed.example.com',
      errorCode: 'net::ERR_CERT_AUTHORITY_INVALID',
      issuer: 'Acme Internal CA',
    });
    answerLastPrompt(false);
    await decision;
  });
});

/**
 * The exception itself is in-memory and dies with the process, deliberately — a persisted one would be
 * a standing transport-security downgrade. That is exactly why the DECISION needs a permanent row:
 * otherwise the fact that it ever happened leaves no trace anywhere.
 */
describe('the journal record', () => {
  // The file-level beforeEach resets the window mock, so each test supplies its own.
  beforeEach(() => {
    journalProceed.mockClear();
    focusedWindow.mockReturnValue(windowThatPrompts());
  });

  it('records a proceed, with the origin and the error code', async () => {
    const decision = decideCertificateError({
      url: 'https://intranet.example.com/x',
      errorCode: 'ERR_CERT_AUTHORITY_INVALID',
      issuer: 'Test CA',
      expiry: '2030-01-01T00:00:00.000Z',
    });
    answerLastPrompt(true);
    await decision;
    expect(journalProceed).toHaveBeenCalledWith(
      'https://intranet.example.com',
      'ERR_CERT_AUTHORITY_INVALID',
    );
  });

  it('records NOTHING when the connection is refused', async () => {
    // Refusals are not remembered either, so recording them would let one broken site write unbounded
    // rows and bury the one line that matters.
    const decision = decideCertificateError({
      url: 'https://intranet.example.com/x',
      errorCode: 'ERR_CERT_DATE_INVALID',
      issuer: 'Test CA',
      expiry: '2020-01-01T00:00:00.000Z',
    });
    answerLastPrompt(false);
    await decision;
    expect(journalProceed).not.toHaveBeenCalled();
  });

  it('records nothing on a sensitive site, which is hard-blocked with no prompt at all', async () => {
    await decideCertificateError({
      url: 'https://www.garanti.com.tr/',
      errorCode: 'ERR_CERT_AUTHORITY_INVALID',
      issuer: 'Test CA',
      expiry: '2030-01-01T00:00:00.000Z',
    });
    expect(journalProceed).not.toHaveBeenCalled();
  });
});
