import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Certificate } from 'electron';

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

const { clearClientCertificateChoices, decideClientCertificate, resolveClientCertificate } =
  await import('./client-certificate-broker');

/**
 * The defect this broker exists for, stated once: Electron's own typings say
 * "Using `event.preventDefault()` prevents the application from using the first certificate from the
 * store" — i.e. with no handler it SENDS THE FIRST ONE, to any site that asks, with no prompt. A
 * client certificate is a private-key-backed assertion of who the user is, and in this product's
 * primary market (e-Devlet, corporate enrolment) users really do have one installed.
 *
 * So every test below is ultimately asking one question: can anything other than an explicit user
 * choice cause a certificate to be sent?
 */

function windowThatPrompts() {
  return { isDestroyed: () => false, webContents: { send } };
}

function answerLastPrompt(index: number | null): void {
  const [, request] = send.mock.calls.at(-1) as [string, { requestId: string }];
  resolveClientCertificate({ requestId: request.requestId, index });
}

function cert(subject: string): Certificate {
  return {
    subjectName: subject,
    issuerName: 'Test CA',
    validExpiry: 4_102_444_800,
  } as unknown as Certificate;
}

const CERTS = [cert('Ada Lovelace'), cert('Ada Lovelace (work)')];

beforeEach(() => {
  vi.clearAllMocks();
  clearClientCertificateChoices();
  focusedWindow.mockReturnValue(windowThatPrompts());
});

describe('decideClientCertificate', () => {
  it('sends the certificate the user picked, and only that one', async () => {
    const decision = decideClientCertificate('https://intranet.example.com/', CERTS);
    answerLastPrompt(1);
    await expect(decision).resolves.toBe(CERTS[1]);
  });

  it('sends NOTHING when the user declines', async () => {
    const decision = decideClientCertificate('https://intranet.example.com/', CERTS);
    answerLastPrompt(null);
    await expect(decision).resolves.toBeNull();
  });

  it('sends nothing when there is no window to ask in — never the first certificate', async () => {
    focusedWindow.mockReturnValue(null);
    await expect(decideClientCertificate('https://a.example.com/', CERTS)).resolves.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('sends nothing when the store offered nothing, rather than leaving the connection hanging', async () => {
    await expect(decideClientCertificate('https://a.example.com/', [])).resolves.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('sends nothing for an out-of-range index — the renderer is untrusted', async () => {
    const decision = decideClientCertificate('https://a.example.com/', CERTS);
    answerLastPrompt(99);
    await expect(decision).resolves.toBeNull();
  });

  it('never puts a certificate on the wire to the renderer, only display strings', async () => {
    const decision = decideClientCertificate('https://a.example.com/', CERTS);
    const [, request] = send.mock.calls.at(-1) as [string, { options: unknown[] }];
    expect(request.options).toEqual([
      {
        index: 0,
        subject: 'Ada Lovelace',
        issuer: 'Test CA',
        expiry: expect.any(String) as string,
      },
      {
        index: 1,
        subject: 'Ada Lovelace (work)',
        issuer: 'Test CA',
        expiry: expect.any(String) as string,
      },
    ]);
    answerLastPrompt(null);
    await decision;
  });

  describe('remembering, for this run only', () => {
    it('does not re-prompt for the same origin — TLS re-negotiates per connection', async () => {
      const first = decideClientCertificate('https://intranet.example.com/a', CERTS);
      answerLastPrompt(0);
      await expect(first).resolves.toBe(CERTS[0]);

      send.mockClear();
      const second = decideClientCertificate('https://intranet.example.com/b', CERTS);
      await expect(second).resolves.toBe(CERTS[0]);
      expect(send).not.toHaveBeenCalled();
    });

    it('remembers a REFUSAL too, so declining once is not asked again all session', async () => {
      const first = decideClientCertificate('https://intranet.example.com/', CERTS);
      answerLastPrompt(null);
      await expect(first).resolves.toBeNull();

      send.mockClear();
      await expect(
        decideClientCertificate('https://intranet.example.com/', CERTS),
      ).resolves.toBeNull();
      expect(send).not.toHaveBeenCalled();
    });

    it('is per ORIGIN — a different site asks again', async () => {
      const first = decideClientCertificate('https://a.example.com/', CERTS);
      answerLastPrompt(0);
      await first;

      send.mockClear();
      const second = decideClientCertificate('https://b.example.com/', CERTS);
      expect(send).toHaveBeenCalledTimes(1);
      answerLastPrompt(null);
      await expect(second).resolves.toBeNull();
    });

    it('is dropped by the test seam, standing in for a restart', async () => {
      const first = decideClientCertificate('https://a.example.com/', CERTS);
      answerLastPrompt(0);
      await first;

      clearClientCertificateChoices();
      send.mockClear();
      const second = decideClientCertificate('https://a.example.com/', CERTS);
      expect(send).toHaveBeenCalledTimes(1);
      answerLastPrompt(null);
      await second;
    });
  });
});
