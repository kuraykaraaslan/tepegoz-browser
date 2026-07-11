import { useEffect, useMemo, useState } from 'react';
import { originOf } from './panel-helpers';
import type { TypoCheckResult, TypoDictionaryInfo, TypoHostApi, TypoSettings } from './types';

export interface TypoControlsState {
  settings: TypoSettings | null;
  setSettings: (settings: TypoSettings) => void;
  dictionaries: TypoDictionaryInfo[];
  busyId: string | null;
  setBusyId: (id: string | null) => void;
  sample: string;
  setSample: (sample: string) => void;
  result: TypoCheckResult | null;
  activeOrigin: string | null;
  sitePaused: boolean;
  refresh: () => Promise<void>;
  patch: (patchSettings: Partial<TypoSettings>) => Promise<void>;
  toggleSite: () => Promise<void>;
  check: (deep: boolean) => Promise<void>;
}

export function useTypoControls(api: TypoHostApi): TypoControlsState {
  const [settings, setSettings] = useState<TypoSettings | null>(null);
  const [dictionaries, setDictionaries] = useState<TypoDictionaryInfo[]>([]);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sample, setSample] = useState('');
  const [result, setResult] = useState<TypoCheckResult | null>(null);

  const activeOrigin = useMemo(() => originOf(activeUrl), [activeUrl]);
  const sitePaused =
    settings !== null && activeOrigin !== null && settings.disabledOrigins.includes(activeOrigin);

  async function refresh(): Promise<void> {
    const [state, nextUrl] = await Promise.all([api.getTypoState(), api.getActiveTabUrl()]);
    setSettings(state.settings);
    setDictionaries(state.dictionaries);
    setActiveUrl(nextUrl);
  }

  useEffect(() => {
    let alive = true;
    void Promise.all([api.getTypoState(), api.getActiveTabUrl()]).then(
      ([state, nextUrl]) => {
        if (!alive) return;
        setSettings(state.settings);
        setDictionaries(state.dictionaries);
        setActiveUrl(nextUrl);
      },
      () => {
        /* host unavailable */
      },
    );
    const unsubscribe = api.onTypoDictionariesState((items) => {
      if (alive) setDictionaries(items);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [api]);

  async function patch(patchSettings: Partial<TypoSettings>): Promise<void> {
    setSettings(await api.setTypoSettings(patchSettings));
  }

  async function toggleSite(): Promise<void> {
    if (activeOrigin === null) return;
    setSettings(await api.setTypoSiteEnabled(activeOrigin, sitePaused));
  }

  async function check(deep: boolean): Promise<void> {
    const text = sample.trim();
    if (text.length === 0) return;
    setResult(
      await api.checkTypoText({
        text,
        language: settings?.defaultLanguage,
        origin: activeOrigin ?? undefined,
        aiMode: deep ? 'manual' : 'auto',
      }),
    );
  }

  return {
    settings,
    setSettings,
    dictionaries,
    busyId,
    setBusyId,
    sample,
    setSample,
    result,
    activeOrigin,
    sitePaused,
    refresh,
    patch,
    toggleSite,
    check,
  };
}
