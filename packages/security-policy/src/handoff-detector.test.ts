import { describe, it, expect } from 'vitest';
import { detectHandoff, HANDOFF_KINDS } from './handoff-detector';

describe('detectHandoff', () => {
  it('detects a reCAPTCHA challenge in page text', () => {
    const signal = detectHandoff('Please verify you are human to continue');
    expect(signal?.kind).toBe('captcha');
  });

  it('detects a captcha provider referenced only in an embedded URL', () => {
    const signal = detectHandoff('loading widget', 'https://www.google.com/recaptcha/api2/anchor');
    expect(signal?.kind).toBe('captcha');
    expect(signal?.matched).toBe('recaptcha');
  });

  it('detects a 2FA / one-time-code prompt', () => {
    expect(detectHandoff('Enter the verification code we sent to your phone')?.kind).toBe('twofa');
    expect(detectHandoff('Open your authenticator app and enter the code')?.kind).toBe('twofa');
  });

  it('prefers CAPTCHA over 2FA when both appear', () => {
    expect(detectHandoff('Enter your verification code after the captcha')?.kind).toBe('captcha');
  });

  it('is case-insensitive', () => {
    expect(detectHandoff('COMPLETE THE CAPTCHA')?.kind).toBe('captcha');
  });

  it('returns null for ordinary content and empty input', () => {
    expect(detectHandoff('Welcome to the news homepage', 'https://news.test/home')).toBeNull();
    expect(detectHandoff('')).toBeNull();
    expect(detectHandoff('   ')).toBeNull();
  });

  it('exposes exactly the two supported kinds', () => {
    expect(HANDOFF_KINDS).toEqual(['captcha', 'twofa']);
  });
});
