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

  it('does NOT fire on a hex asset hash that contains the "2fa" triple (the kuray.dev/blog bug)', () => {
    // Next.js fingerprints like `chunks/fa323fb3462fa0c7.js` embed the hex triple 2fa; a naive
    // substring scan wrongly reported a 2FA challenge on a plain blog page.
    const perceived =
      '# Blog | Kuray Karaaslan\n' +
      '<script src="/_next/static/chunks/fa323fb3462fa0c7.js"></script>\n' +
      'Latest Posts: Domain-Driven, Expo Router nested layouts, Zod DTO validation.';
    expect(detectHandoff(perceived, 'https://kuray.dev/blog')).toBeNull();
  });

  it('does NOT fire when a page merely mentions 2FA/OTP as a topic (no challenge cue)', () => {
    expect(
      detectHandoff('In this article we compare 2FA and OTP approaches to account security.'),
    ).toBeNull();
    expect(detectHandoff('A security code review checklist for your backend.')).toBeNull();
  });

  it('does NOT fire on "otp" embedded inside another token', () => {
    expect(detectHandoff('cache key: aXotpQ9 — nothing to see here')).toBeNull();
  });

  it('still fires on a bare 2FA/OTP token WHEN a challenge cue is adjacent', () => {
    expect(detectHandoff('Enter your 2FA code to continue')?.kind).toBe('twofa');
    expect(detectHandoff('Type the OTP we sent to your email')?.kind).toBe('twofa');
    expect(detectHandoff('Please enter the security code from your authenticator')?.kind).toBe(
      'twofa',
    );
    expect(detectHandoff('Type the passcode from the SMS we just sent you')?.kind).toBe('twofa');
    expect(detectHandoff('Enter one of your backup codes to sign in')?.kind).toBe('twofa');
  });

  it('does NOT fire when backup codes are merely discussed (no challenge cue)', () => {
    expect(detectHandoff('Remember to store your backup codes somewhere safe.')).toBeNull();
  });

  it('detects bot-wall interstitials by their fixed copy', () => {
    expect(detectHandoff('Checking your browser before you access example.com')?.kind).toBe(
      'captcha',
    );
    expect(detectHandoff('example.com needs to review the security of your connection')?.kind).toBe(
      'captcha',
    );
    expect(detectHandoff('Press & Hold to confirm you are human')?.kind).toBe('captcha');
  });

  it('handles a Unicode (Turkish) letter glued to a weak token as a boundary, not a match', () => {
    // '[a-z0-9]' would treat 'ö' as a boundary and match '2fa'; the \p{L} boundary rejects it.
    expect(detectHandoff('sürüm güvenlik2fa yükleniyor')).toBeNull();
  });

  it('exposes exactly the supported kinds', () => {
    expect(HANDOFF_KINDS).toEqual(['captcha', 'twofa', 'login']);
  });

  // --- Login walls (the "instagrama gir ve beğen" bug: agent hit a login card, worked around it) ---

  it('detects a login wall from a perceived password field (render-DOM listing)', () => {
    // The interactable listing renders a password input verbatim; a visible password box is an
    // unambiguous credential prompt the agent can never fill itself.
    const perceived =
      '[1]<input type="text" name="username" placeholder="Phone number, username, or email" />\n' +
      '[2]<input type="password" name="password" placeholder="Password" />\n' +
      '[3]<button>Log in</button>';
    const signal = detectHandoff(perceived, 'https://www.instagram.com/');
    expect(signal?.kind).toBe('login');
    expect(signal?.matched).toBe('type=password');
  });

  it('detects a login wall from gated wall copy (accessibility-tree fallback, no attrs)', () => {
    expect(detectHandoff('Please log in to continue to your feed')?.kind).toBe('login');
    expect(detectHandoff('You must be logged in to like this post')?.kind).toBe('login');
    expect(detectHandoff('Your session has expired. Sign in again to continue.')?.kind).toBe(
      'login',
    );
  });

  it('does NOT fire on a bare "Log In" / "Sign Up" nav link (the /explore false-positive)', () => {
    // Instagram's /explore is browsable without an account; its element listing carries only the
    // header Log In / Sign Up controls and topic links — no password field, no wall copy. Firing a
    // login handoff here is exactly the over-match we must avoid.
    const explore =
      '[1]<a href="/accounts/login/">Log In</a>\n' +
      '[2]<a href="/accounts/emailsignup/">Sign Up</a>\n' +
      '[3]<a href="/explore/tags/bonnie-tyler/">Bonnie Tyler · 367K posts</a>\n' +
      '[4]<a href="/p/abc123/">Brandon Aiyuk Jayden</a>';
    expect(detectHandoff(explore, 'https://www.instagram.com/explore/')).toBeNull();
  });

  it('does NOT fire when login is merely a topic/nav mention (no password field, no wall copy)', () => {
    expect(
      detectHandoff('Sign in with your account or create a new one', 'https://site.test/'),
    ).toBeNull();
    expect(detectHandoff('How to log in to your router — a step-by-step guide')).toBeNull();
    expect(detectHandoff('This article explains why password managers matter.')).toBeNull();
  });

  it('does NOT match "password" as a prose word (only the type= attribute form)', () => {
    expect(detectHandoff('Choose a strong password and never reuse it across sites.')).toBeNull();
    expect(detectHandoff('Your password strength is: excellent')).toBeNull();
  });

  it('keeps CAPTCHA / 2FA precedence over a co-located login wall', () => {
    const withCaptcha =
      '[1]<input type="password" name="password" />\nPlease complete the captcha to sign in';
    expect(detectHandoff(withCaptcha)?.kind).toBe('captcha');
    const with2fa =
      '[1]<input type="password" />\nEnter the verification code we sent to your phone';
    expect(detectHandoff(with2fa)?.kind).toBe('twofa');
  });
});
