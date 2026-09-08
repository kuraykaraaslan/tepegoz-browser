import { useCallback, useState } from 'react';
import {
  DEFAULT_READER_PREFERENCES,
  parseReaderPreferences,
  type ReaderPreferences,
} from '@tepegoz/reader';

/**
 * Reading-view preferences (font size + reading theme) for the chrome.
 *
 * Kept in `localStorage` rather than the app `Preferences` store: the reading view is a renderer-only
 * overlay with no main-process surface, the choice is a per-viewer convenience, and `parseReaderPrefs`
 * already treats whatever comes back as untrusted. Every access is wrapped — a private-mode window or
 * a profile with storage disabled still gets a working session-local choice, it just does not persist.
 */

const STORAGE_KEY = 'tepegoz.reader.prefs';

function loadPreferences(): ReaderPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_READER_PREFERENCES };
    return parseReaderPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_READER_PREFERENCES };
  }
}

export interface ReaderPreferencesResult {
  preferences: ReaderPreferences;
  setPreferences: (next: ReaderPreferences) => void;
}

export function useReaderPreferences(): ReaderPreferencesResult {
  const [preferences, setState] = useState<ReaderPreferences>(loadPreferences);

  const setPreferences = useCallback((next: ReaderPreferences): void => {
    setState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode, disabled) — the choice still applies for this session.
    }
  }, []);

  return { preferences, setPreferences };
}
