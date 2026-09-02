import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Main-process wiring for the User-Agent switcher host (ADR-0024). The module is all adapter
 * closures handed to the Electron-free `createUserAgentHost`, plus one module-load side effect: it
 * registers a `BrowsingSessions` attacher that replays the last-applied UA onto every session created
 * later. Pinned: each adapter routes to the right store/session/tab call, the default UA is captured
 * once and memoised, `applyToSession` fans out to every session AND arms the attacher, and the
 * attacher is inert until a UA has actually been applied.
 */

type HostOpts = {
  getPersisted: () => string | undefined;
  setPersisted: (ua: string) => void;
  defaultUserAgent: () => string;
  applyToSession: (ua: string) => void;
  applyToTabs: (ua: string) => void;
  isEnabled: () => boolean;
};

const cap = vi.hoisted(
  (): { opts?: HostOpts; attacher?: (ses: { setUserAgent: unknown }) => void } => ({}),
);

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

vi.mock('@tepegoz/ext-user-agent/host', () => ({
  USER_AGENT_EXTENSION_ID: 'ua-ext',
  createUserAgentHost: (opts: HostOpts) => {
    cap.opts = opts;
    return { __host: true };
  },
}));

const isExtensionEnabled = vi.hoisted(() => vi.fn(() => true));
vi.mock('@tepegoz/desktop-ipc', () => ({ isExtensionEnabled }));

const prefs = vi.hoisted(() => ({
  getAll: vi.fn(() => ({ userAgent: 'Stored/9', extensions: { 'ua-ext': true } })),
  update: vi.fn(),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const tabManager = vi.hoisted(() => ({ applyUserAgent: vi.fn() }));
vi.mock('../tabs', () => ({ default: tabManager }));

const directSes = vi.hoisted(() => ({ getUserAgent: vi.fn(() => 'DirectDefault/1.0') }));
const sessionA = vi.hoisted(() => ({ setUserAgent: vi.fn() }));
const sessionB = vi.hoisted(() => ({ setUserAgent: vi.fn() }));
const browsingSessions = vi.hoisted(() => ({
  register: vi.fn(),
  direct: vi.fn(() => directSes),
  all: vi.fn(() => [{ session: sessionA }, { session: sessionB }]),
}));
vi.mock('../network/browsing-sessions.electron', () => ({ default: browsingSessions }));

const { default: userAgentHost } = await import('./user-agent-host.electron');
cap.attacher = browsingSessions.register.mock.calls[0]![1] as (ses: {
  setUserAgent: unknown;
}) => void;
const opts = (): HostOpts => cap.opts!;

beforeEach(() => {
  logger.info.mockClear();
  prefs.update.mockClear();
  tabManager.applyUserAgent.mockClear();
  directSes.getUserAgent.mockClear();
  sessionA.setUserAgent.mockClear();
  sessionB.setUserAgent.mockClear();
  isExtensionEnabled.mockClear();
});

it('exports whatever createUserAgentHost returned, and registered an attacher at load', () => {
  expect(userAgentHost).toEqual({ __host: true });
  expect(browsingSessions.register).toHaveBeenCalledWith('user-agent', expect.any(Function));
});

describe('persistence adapters', () => {
  it('getPersisted reads PreferenceStore.userAgent', () => {
    expect(opts().getPersisted()).toBe('Stored/9');
  });

  it('setPersisted writes it back', () => {
    opts().setPersisted('Custom/2');
    expect(prefs.update).toHaveBeenCalledWith({ userAgent: 'Custom/2' });
  });

  it('isEnabled consults isExtensionEnabled with the prefs map + extension id', () => {
    expect(opts().isEnabled()).toBe(true);
    expect(isExtensionEnabled).toHaveBeenCalledWith({ 'ua-ext': true }, 'ua-ext');
  });
});

describe('the attacher is inert until a UA is applied', () => {
  it('does nothing for a fresh session while no UA has been applied', () => {
    const fresh = { setUserAgent: vi.fn() };
    cap.attacher!(fresh);
    expect(fresh.setUserAgent).not.toHaveBeenCalled();
  });
});

describe('defaultUserAgent', () => {
  it('captures the Direct session UA once and memoises it', () => {
    expect(opts().defaultUserAgent()).toBe('DirectDefault/1.0');
    expect(opts().defaultUserAgent()).toBe('DirectDefault/1.0');
    expect(browsingSessions.direct).toHaveBeenCalledTimes(1);
  });
});

describe('applyToSession', () => {
  it('sets the UA on every existing session and arms the attacher for future ones', () => {
    opts().applyToSession('Fleet/3');
    expect(sessionA.setUserAgent).toHaveBeenCalledWith('Fleet/3');
    expect(sessionB.setUserAgent).toHaveBeenCalledWith('Fleet/3');

    const fresh = { setUserAgent: vi.fn() };
    cap.attacher!(fresh);
    expect(fresh.setUserAgent).toHaveBeenCalledWith('Fleet/3');
  });
});

describe('applyToTabs', () => {
  it('pushes the UA to TabManager and logs isDefault:false for an override', () => {
    opts().applyToTabs('Override/4');
    expect(tabManager.applyUserAgent).toHaveBeenCalledWith('Override/4');
    expect(logger.info).toHaveBeenCalledWith('User-Agent override applied', { isDefault: false });
  });

  it('logs isDefault:true when the UA equals the captured default', () => {
    const dflt = opts().defaultUserAgent();
    opts().applyToTabs(dflt);
    expect(logger.info).toHaveBeenCalledWith('User-Agent override applied', { isDefault: true });
  });
});
