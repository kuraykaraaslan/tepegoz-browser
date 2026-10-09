import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({ configureHostResolver: vi.fn() }));
vi.mock('electron', () => ({ app: electron }));
const logger = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));
const prefs = vi.hoisted((): { values: Record<string, unknown> } => ({ values: {} }));
vi.mock('@tepegoz/preferences', () => ({ default: { getAll: () => prefs.values } }));

const { applySecureDns } = await import('./secure-dns.electron');

beforeEach(() => {
  electron.configureHostResolver.mockReset();
  logger.warn.mockReset();
  prefs.values = {};
});

describe('applySecureDns', () => {
  it('hands Chromium the resolved mode and servers', () => {
    prefs.values = { secureDnsMode: 'secure', secureDnsProvider: 'quad9' };
    applySecureDns();
    expect(electron.configureHostResolver).toHaveBeenCalledWith({
      secureDnsMode: 'secure',
      secureDnsServers: ['https://dns.quad9.net/dns-query'],
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('turns it OFF again when the setting goes back to off (it must be re-applied, not just set once)', () => {
    prefs.values = { secureDnsMode: 'off' };
    applySecureDns();
    expect(electron.configureHostResolver).toHaveBeenCalledWith({
      secureDnsMode: 'off',
      secureDnsServers: [],
    });
  });

  it('warns and uses the system resolver for an unusable custom server', () => {
    prefs.values = {
      secureDnsMode: 'secure',
      secureDnsProvider: 'custom',
      secureDnsCustomUrl: 'http://x/',
    };
    applySecureDns();
    expect(electron.configureHostResolver).toHaveBeenCalledWith({
      secureDnsMode: 'off',
      secureDnsServers: [],
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('never throws: a resolver failure is logged and the browser keeps starting', () => {
    electron.configureHostResolver.mockImplementation(() => {
      throw new Error('too early');
    });
    expect(() => applySecureDns()).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith('Could not configure secure DNS', expect.anything());
  });
});
