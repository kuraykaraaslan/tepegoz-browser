import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const { closedTabs, rememberClosedTab, takeClosedTab, recentlyClosedTabs } = await import(
  './tabs-shared'
);

describe('the recently-closed list', () => {
  beforeEach(() => {
    closedTabs.length = 0;
  });

  it('reads back newest-first, while Ctrl+Shift+T keeps taking the newest', () => {
    rememberClosedTab('https://a.example/', 'A', 1);
    rememberClosedTab('https://b.example/', 'B', 2);
    expect(recentlyClosedTabs().map((t) => t.url)).toEqual([
      'https://b.example/',
      'https://a.example/',
    ]);
    expect(takeClosedTab()?.url).toBe('https://b.example/');
    expect(takeClosedTab()?.url).toBe('https://a.example/');
    expect(takeClosedTab()).toBeUndefined();
  });

  it('takes the entry an id names out of the middle, leaving the order around it intact', () => {
    rememberClosedTab('https://a.example/', 'A', 1);
    rememberClosedTab('https://b.example/', 'B', 2);
    rememberClosedTab('https://c.example/', 'C', 3);
    const middle = recentlyClosedTabs()[1];
    expect(middle?.url).toBe('https://b.example/');
    expect(takeClosedTab(middle?.id)?.url).toBe('https://b.example/');
    expect(recentlyClosedTabs().map((t) => t.url)).toEqual([
      'https://c.example/',
      'https://a.example/',
    ]);
  });

  it('takes an entry only once — a stale menu row cannot reopen the same tab twice', () => {
    rememberClosedTab('https://a.example/', 'A', 1);
    const only = recentlyClosedTabs()[0];
    expect(takeClosedTab(only?.id)).toBeDefined();
    expect(takeClosedTab(only?.id)).toBeUndefined();
  });

  it('keeps the newest 25 and drops the oldest past the cap', () => {
    for (let i = 0; i < 30; i += 1) rememberClosedTab(`https://e.example/${String(i)}`, '', i);
    const list = recentlyClosedTabs();
    expect(list).toHaveLength(25);
    expect(list[0]?.url).toBe('https://e.example/29');
    expect(list.at(-1)?.url).toBe('https://e.example/5');
  });

  it('records the title, because a closed tab cannot be asked for it afterwards', () => {
    rememberClosedTab('https://a.example/', 'Release notes', 7);
    expect(recentlyClosedTabs()[0]).toMatchObject({ title: 'Release notes', closedAt: 7 });
  });
});
