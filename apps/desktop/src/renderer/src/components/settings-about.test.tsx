// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { AppInfo } from '@tepegoz/desktop-ipc';
import { AboutSection } from './settings-about';
import { THIRD_PARTY_NOTICES_FALLBACK_URL } from './settings-about-links';

/**
 * The About page. What is worth testing here is not the layout but the four places it can quietly
 * lie about the build:
 *
 *  - a bridge that REJECTS must leave visible dashes, not a card that renders as though this build
 *    simply has no version — the old section hid every row on failure;
 *  - an unstamped build must SAY unstamped rather than showing a blank Build row;
 *  - "third-party notices" must reach the online copy when the local file is absent, because a legal
 *    notice that opens nothing is worse than no button at all;
 *  - the links must be anchors with real `href`s, which is what gives them URL preview, middle-click
 *    and "copy link address". Rendering them as `<button onClick>` takes all three away silently.
 */

interface Bridge {
  info: AppInfo | 'reject';
  /** `false` ⇒ the clipboard write rejects. */
  canCopy: boolean;
  noticesOpened: boolean | 'reject';
  /** `'ok'` ⇒ resolves true, `'false'` ⇒ resolves false, `'reject'` ⇒ rejects. */
  dataFolder: 'ok' | 'false' | 'reject';
  tabs: string[];
}
const bridge = vi.hoisted(
  (): Bridge => ({ info: 'reject', canCopy: true, noticesOpened: true, dataFolder: 'ok', tabs: [] }),
);

function appInfo(over: Partial<AppInfo> = {}): AppInfo {
  return {
    name: 'Tepegöz',
    version: '0.1.0',
    platform: 'win32',
    glassAvailable: false,
    os: { name: 'Windows 11', version: '10.0.26200', arch: 'x64' },
    engines: { chromium: '140.0.7339.207', electron: '43.0.0', node: '24.4.0', v8: '14.0.365.4' },
    build: { channel: 'stable', commit: 'abc12345', builtAt: '2026-08-28T09:00:00.000Z', packaged: true },
    license: 'AGPL-3.0-only',
    ...over,
  };
}

beforeEach(() => {
  bridge.info = appInfo();
  bridge.canCopy = true;
  bridge.noticesOpened = true;
  bridge.dataFolder = 'ok';
  bridge.tabs = [];
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: {
      getAppInfo: () =>
        bridge.info === 'reject'
          ? Promise.reject(new Error('bridge unavailable'))
          : Promise.resolve(bridge.info),
      copyDiagnostics: () =>
        bridge.canCopy
          ? Promise.resolve('diagnostics')
          : Promise.reject(new Error('no clipboard')),
      openThirdPartyNotices: () =>
        bridge.noticesOpened === 'reject'
          ? Promise.reject(new Error('notices path blew up'))
          : Promise.resolve(bridge.noticesOpened),
      openDataFolder: () =>
        bridge.dataFolder === 'reject'
          ? Promise.reject(new Error('no shell'))
          : Promise.resolve(bridge.dataFolder === 'ok'),
      createTab: (url: string) => bridge.tabs.push(url),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderAbout(locale: 'en' | 'tr' = 'en') {
  render(
    <I18nProvider locale={locale}>
      <AboutSection />
    </I18nProvider>,
  );
}

/** The `<dd>` that follows the row labelled `label`. */
function row(label: RegExp): string {
  return screen.getByText(label).nextElementSibling?.textContent ?? '';
}

describe('build facts', () => {
  it('shows the engine versions a bug report is worthless without', async () => {
    renderAbout();

    await waitFor(() => {
      expect(row(/^Chromium$/)).toBe('140.0.7339.207');
    });
    expect(row(/^Electron$/)).toBe('43.0.0');
    expect(row(/^Node\.js$/)).toBe('24.4.0');
    expect(row(/^V8$/)).toBe('14.0.365.4');
  });

  it('renders the OS as a person recognises it, not as `win32`', async () => {
    renderAbout();

    await waitFor(() => {
      expect(row(/Operating system/)).toBe('Windows 11 10.0.26200 (x64)');
    });
    expect(screen.queryByText('win32')).toBeNull();
  });

  it('says a build is unstamped rather than showing an empty Build row', async () => {
    bridge.info = appInfo({
      build: { channel: 'dev', commit: '', builtAt: '', packaged: false },
    });
    renderAbout();

    await waitFor(() => {
      expect(row(/^Build$/)).toBe('Not stamped');
    });
    expect(screen.getByText('Development build')).not.toBeNull();
  });

  it('leaves dashes when the bridge is unreachable, instead of an empty card', async () => {
    bridge.info = 'reject';
    renderAbout();

    await waitFor(() => {
      expect(row(/^Version$/)).toBe('—');
    });
    expect(row(/^Chromium$/)).toBe('—');
    expect(row(/Operating system/)).toBe('—');
  });
});

describe('diagnostics', () => {
  it('confirms the copy so the user knows there is something to paste', async () => {
    renderAbout();
    fireEvent.click(screen.getByRole('button', { name: /Copy diagnostics/ }));

    await waitFor(() => {
      expect(screen.getByText('Copied')).not.toBeNull();
    });
  });

  it('reports a failed copy instead of silently claiming success', async () => {
    bridge.canCopy = false;
    renderAbout();
    fireEvent.click(screen.getByRole('button', { name: /Copy diagnostics/ }));

    await waitFor(() => {
      expect(screen.getByText(/Could not reach the clipboard/)).not.toBeNull();
    });
  });
});

describe('legal', () => {
  it('names the license the build actually reports', async () => {
    renderAbout();

    await waitFor(() => {
      expect(screen.getByText(/AGPL-3\.0-only/)).not.toBeNull();
    });
  });

  it('falls back to the online notices when this build ships none', async () => {
    bridge.noticesOpened = false;
    renderAbout();
    fireEvent.click(screen.getByRole('button', { name: /Open notices/ }));

    await waitFor(() => {
      expect(bridge.tabs).toEqual([THIRD_PARTY_NOTICES_FALLBACK_URL]);
    });
    expect(screen.getByText(/ships no notices file/)).not.toBeNull();
  });

  it('falls back to the online notices when the local open call rejects outright', async () => {
    bridge.noticesOpened = 'reject';
    renderAbout();
    fireEvent.click(screen.getByRole('button', { name: /Open notices/ }));

    await waitFor(() => {
      expect(bridge.tabs).toEqual([THIRD_PARTY_NOTICES_FALLBACK_URL]);
    });
    expect(screen.getByText(/ships no notices file/)).not.toBeNull();
  });

  it('opens nothing extra when the local notices file was there', async () => {
    renderAbout();
    fireEvent.click(screen.getByRole('button', { name: /Open notices/ }));

    await waitFor(() => {
      expect(screen.queryByText(/ships no notices file/)).toBeNull();
    });
    expect(bridge.tabs).toEqual([]);
  });
});

describe('opening the data folder', () => {
  it('stays silent when the OS opened the folder', async () => {
    renderAbout();
    await waitFor(() => expect(screen.getByRole('button', { name: /data folder/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /data folder/i }));
    await waitFor(() =>
      expect(screen.queryByText(/data folder could not be opened/i)).toBeNull(),
    );
  });

  it('shows the failure line when the folder did not open', async () => {
    bridge.dataFolder = 'false';
    renderAbout();
    await waitFor(() => expect(screen.getByRole('button', { name: /data folder/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /data folder/i }));
    await waitFor(() =>
      expect(screen.getByText(/data folder could not be opened/i)).toBeTruthy(),
    );
  });

  it('shows the failure line when the open call rejects', async () => {
    bridge.dataFolder = 'reject';
    renderAbout();
    await waitFor(() => expect(screen.getByRole('button', { name: /data folder/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /data folder/i }));
    await waitFor(() =>
      expect(screen.getByText(/data folder could not be opened/i)).toBeTruthy(),
    );
  });
});

describe('links', () => {
  it('renders addresses as anchors carrying their real href', () => {
    renderAbout();

    const source = screen.getByRole('link', { name: /Source code/ });
    expect(source.getAttribute('href')).toBe('https://github.com/kuraykaraaslan/tepegoz-browser');
    expect(screen.getByRole('link', { name: /Report an issue/ }).getAttribute('href')).toBe(
      'https://github.com/kuraykaraaslan/tepegoz-browser/issues/new',
    );
  });

  it('opens them in a Tepegöz tab rather than letting the anchor navigate the settings page', () => {
    renderAbout();
    fireEvent.click(screen.getByRole('link', { name: /Source code/ }));

    expect(bridge.tabs).toEqual(['https://github.com/kuraykaraaslan/tepegoz-browser']);
  });

  it('localizes the surface it renders, Turkish included', async () => {
    renderAbout('tr');

    await waitFor(() => {
      expect(screen.getByText('Sürüm ve derleme')).not.toBeNull();
    });
    expect(screen.getByRole('button', { name: /Tanılama bilgisini kopyala/ })).not.toBeNull();
    expect(screen.getByText(/İşletim sistemi/)).not.toBeNull();
  });
});
