import { beforeEach, describe, expect, it, vi } from 'vitest';

const isDefaultProtocolClient = vi.fn();
const setAsDefaultProtocolClient = vi.fn();
let isPackaged = false;

vi.mock('electron', () => ({
  app: {
    isDefaultProtocolClient: (...args: unknown[]) => isDefaultProtocolClient(...args) as unknown,
    setAsDefaultProtocolClient: (...args: unknown[]) =>
      setAsDefaultProtocolClient(...args) as unknown,
    get isPackaged() {
      return isPackaged;
    },
    getAppPath: () => 'C:\\tepegoz-browser\\apps\\desktop',
  },
}));
vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { getDefaultBrowserStatus, setAsDefaultBrowser } = await import('./default-browser');

/**
 * Default-browser registration. The properties worth pinning: BOTH protocols must be registered for
 * `isDefault` to read true (a browser that only claimed https would silently lose every plain-http
 * link), the status is always re-read from the OS rather than assumed, and a thrown Electron call is
 * swallowed into `false` rather than crashing the Settings row that called it.
 */
describe('getDefaultBrowserStatus', () => {
  beforeEach(() => {
    isDefaultProtocolClient.mockReset();
    setAsDefaultProtocolClient.mockReset();
    isPackaged = false;
  });

  it('is true only when BOTH http and https are registered', () => {
    isDefaultProtocolClient.mockReturnValue(true);
    expect(getDefaultBrowserStatus()).toEqual({ isDefault: true });
    expect(isDefaultProtocolClient).toHaveBeenCalledWith('http');
    expect(isDefaultProtocolClient).toHaveBeenCalledWith('https');
  });

  it('is false when only one protocol is registered', () => {
    isDefaultProtocolClient.mockImplementation((protocol: string) => protocol === 'http');
    expect(getDefaultBrowserStatus()).toEqual({ isDefault: false });
  });

  it('reads false, not throws, when Electron itself throws', () => {
    isDefaultProtocolClient.mockImplementation(() => {
      throw new Error('platform refused');
    });
    expect(getDefaultBrowserStatus()).toEqual({ isDefault: false });
  });
});

describe('setAsDefaultBrowser', () => {
  beforeEach(() => {
    isDefaultProtocolClient.mockReset();
    setAsDefaultProtocolClient.mockReset();
    isPackaged = false;
  });

  it('registers both http and https', () => {
    isDefaultProtocolClient.mockReturnValue(true);
    setAsDefaultBrowser();
    expect(setAsDefaultProtocolClient).toHaveBeenCalledWith(
      'http',
      process.execPath,
      expect.any(Array),
    );
    expect(setAsDefaultProtocolClient).toHaveBeenCalledWith(
      'https',
      process.execPath,
      expect.any(Array),
    );
  });

  it('passes the app directory as a relaunch arg only when UNPACKAGED', () => {
    isPackaged = false;
    isDefaultProtocolClient.mockReturnValue(true);
    setAsDefaultBrowser();
    expect(setAsDefaultProtocolClient).toHaveBeenCalledWith('http', process.execPath, [
      'C:\\tepegoz-browser\\apps\\desktop',
    ]);
  });

  it('passes no extra args once PACKAGED', () => {
    isPackaged = true;
    isDefaultProtocolClient.mockReturnValue(true);
    setAsDefaultBrowser();
    expect(setAsDefaultProtocolClient).toHaveBeenCalledWith('http', process.execPath, []);
  });

  it('returns a fresh read of reality, not an assumption that registration succeeded', () => {
    isDefaultProtocolClient.mockReturnValue(false);
    expect(setAsDefaultBrowser()).toEqual({ isDefault: false });
  });

  it('registers the OTHER protocol even when one throws', () => {
    setAsDefaultProtocolClient.mockImplementation((protocol: string) => {
      if (protocol === 'http') throw new Error('refused');
    });
    isDefaultProtocolClient.mockReturnValue(true);
    setAsDefaultBrowser();
    expect(setAsDefaultProtocolClient).toHaveBeenCalledWith(
      'https',
      process.execPath,
      expect.any(Array),
    );
  });
});
