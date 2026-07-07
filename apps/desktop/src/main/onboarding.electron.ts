import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import PreferenceStore from '@tepegoz/preferences';
import TabManager from './tabs';

let browserStarted = false;

function loadRenderer(win: BrowserWindow, query?: Record<string, string>): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl !== undefined && devUrl.length > 0) {
    const suffix = query === undefined ? '' : `?${new URLSearchParams(query).toString()}`;
    void win.loadURL(`${devUrl}${suffix}`);
  } else {
    void win.loadFile(
      join(__dirname, '../renderer/index.html'),
      query === undefined ? undefined : { query },
    );
  }
}

export function shouldShowOnboarding(): boolean {
  return !PreferenceStore.getAll().onboardingCompleted;
}

export function loadOnboarding(win: BrowserWindow): void {
  browserStarted = false;
  loadRenderer(win, { surface: 'onboarding' });
}

export function loadBrowser(win: BrowserWindow): void {
  loadRenderer(win);
  if (browserStarted) return;
  browserStarted = true;
  if (!TabManager.restoreSession()) {
    TabManager.createTab();
  }
}

export function completeOnboarding(win: BrowserWindow): void {
  PreferenceStore.update({ onboardingCompleted: true });
  loadBrowser(win);
}
