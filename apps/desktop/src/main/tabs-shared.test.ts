import { describe, expect, it, vi } from 'vitest';
import type { Session } from 'electron';

vi.mock('@tepegoz/preferences', () => ({
  default: { getAll: () => ({}) },
}));

const { browsedViewWebPreferences } = await import('./tabs-shared');

const FAKE_SESSION = { fake: true } as unknown as Session;

describe('browsedViewWebPreferences', () => {
  it('pins the renderer-hardening invariants for every browsed tab view', () => {
    const prefs = browsedViewWebPreferences(FAKE_SESSION);
    // A regression on any of these is a real sandbox escape surface, not a style nit.
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.sandbox).toBe(true);
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.webSecurity).toBe(true);
    // No preload key at all — a browsed page must never reach the contextBridge.
    expect('preload' in prefs).toBe(false);
  });

  it('passes the exact Session object through (never a partition name)', () => {
    expect(browsedViewWebPreferences(FAKE_SESSION).session).toBe(FAKE_SESSION);
  });

  it('enables Chromium’s built-in PDF viewer so application/pdf renders in-tab', () => {
    expect(browsedViewWebPreferences(FAKE_SESSION).plugins).toBe(true);
  });

  it('keeps background throttling off so AI-driven / background tabs run at full rate', () => {
    expect(browsedViewWebPreferences(FAKE_SESSION).backgroundThrottling).toBe(false);
  });
});
