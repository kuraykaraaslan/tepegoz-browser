import { useCallback, useEffect, useState } from 'react';
import type { NewTabBackground, Preferences } from '@tepegoz/desktop-ipc';
import type { ResolvedNewTabBackground } from '@tepegoz/newtab-ui';
import { DEFAULT_NEWTAB_BACKGROUND } from './App-helpers';

export interface AppContentModel {
  downloadList: () => ReturnType<typeof window.tepegoz.listDownloads>;
  downloadCommand: (
    input: Parameters<typeof window.tepegoz.commandDownload>[0],
  ) => ReturnType<typeof window.tepegoz.commandDownload>;
  downloadSubscribe: (
    callback: Parameters<typeof window.tepegoz.onDownloadsState>[0],
  ) => ReturnType<typeof window.tepegoz.onDownloadsState>;
  uploadList: () => ReturnType<typeof window.tepegoz.listUploads>;
  uploadCommand: (
    input: Parameters<typeof window.tepegoz.commandUpload>[0],
  ) => ReturnType<typeof window.tepegoz.commandUpload>;
  uploadSubscribe: (
    callback: Parameters<typeof window.tepegoz.onUploadsState>[0],
  ) => ReturnType<typeof window.tepegoz.onUploadsState>;
  newTabShortcuts: Preferences['newTabShortcuts'];
  onAddShortcut: (title: string, url: string) => void;
  onEditShortcut: (id: string, title: string, url: string) => void;
  onRemoveShortcut: (id: string) => void;
  resolvedNewTabBackground: ResolvedNewTabBackground;
  onChangeNewTabBackground: (patch: Partial<NewTabBackground>) => void;
  onPickNewTabBackgroundImage: () => Promise<{ ref: string; dataUrl: string } | null>;
  onNewTabSearch: (query: string) => void;
}

/**
 * The new-tab / downloads / uploads data bindings behind the internal content pages: stable IPC command
 * wrappers, the persisted new-tab shortcut list transforms, and the new-tab background (descriptor +
 * uploaded-image cache). Split out of `App-content.tsx` (ADR-0010 250-line cap).
 */
export function useAppContentModel(
  prefs: Preferences | null,
  onUpdatePrefs: (patch: Partial<Preferences>) => Promise<void>,
  activeId: string | null,
): AppContentModel {
  // Fetched-once data URLs for uploaded new-tab background images, keyed by their cas:// ref.
  const [bgImageCache, setBgImageCache] = useState<Record<string, string>>({});

  const downloadList = useCallback(() => window.tepegoz.listDownloads(), []);
  const downloadCommand = useCallback(
    (input: Parameters<typeof window.tepegoz.commandDownload>[0]) =>
      window.tepegoz.commandDownload(input),
    [],
  );
  const downloadSubscribe = useCallback(
    (callback: Parameters<typeof window.tepegoz.onDownloadsState>[0]) =>
      window.tepegoz.onDownloadsState(callback),
    [],
  );
  const uploadList = useCallback(() => window.tepegoz.listUploads(), []);
  const uploadCommand = useCallback(
    (input: Parameters<typeof window.tepegoz.commandUpload>[0]) =>
      window.tepegoz.commandUpload(input),
    [],
  );
  const uploadSubscribe = useCallback(
    (callback: Parameters<typeof window.tepegoz.onUploadsState>[0]) =>
      window.tepegoz.onUploadsState(callback),
    [],
  );

  // New-tab shortcuts are the user's own list (independent of bookmarks), persisted in preferences.
  // Add/edit/remove are plain array transforms over `prefs.newTabShortcuts` (capped at MAX_SHORTCUTS).
  const newTabShortcuts = prefs?.newTabShortcuts ?? [];
  const onAddShortcut = (title: string, url: string): void => {
    const current = prefs?.newTabShortcuts ?? [];
    if (current.length >= 10) return;
    void onUpdatePrefs({
      newTabShortcuts: [...current, { id: crypto.randomUUID(), title: title.trim() || url, url }],
    });
  };
  const onEditShortcut = (id: string, title: string, url: string): void => {
    const current = prefs?.newTabShortcuts ?? [];
    void onUpdatePrefs({
      newTabShortcuts: current.map((s) =>
        s.id === id ? { ...s, title: title.trim() || url, url } : s,
      ),
    });
  };
  const onRemoveShortcut = (id: string): void => {
    const current = prefs?.newTabShortcuts ?? [];
    void onUpdatePrefs({ newTabShortcuts: current.filter((s) => s.id !== id) });
  };

  // New-tab background: the stored descriptor plus any uploaded image resolved to a data URL. Uploaded
  // bytes live in the main-process blob store; fetch each ref once and cache the data URL.
  const newTabBackground = prefs?.newTabBackground ?? DEFAULT_NEWTAB_BACKGROUND;
  useEffect(() => {
    const { kind, imageRef } = newTabBackground;
    if (kind !== 'image' || imageRef === '' || bgImageCache[imageRef] !== undefined) return;
    void window.tepegoz.getNewTabBackgroundImage(imageRef).then((dataUrl) => {
      if (dataUrl !== null) setBgImageCache((c) => ({ ...c, [imageRef]: dataUrl }));
    });
  }, [newTabBackground, bgImageCache]);
  const resolvedNewTabBackground: ResolvedNewTabBackground = {
    ...newTabBackground,
    imageDataUrl:
      newTabBackground.imageRef !== '' ? bgImageCache[newTabBackground.imageRef] : undefined,
  };
  const onChangeNewTabBackground = (patch: Partial<NewTabBackground>): void => {
    void onUpdatePrefs({ newTabBackground: { ...newTabBackground, ...patch } });
  };
  const onPickNewTabBackgroundImage = async (): Promise<{
    ref: string;
    dataUrl: string;
  } | null> => {
    const r = await window.tepegoz.pickNewTabBackgroundImage();
    if (r.cancelled) return null;
    setBgImageCache((c) => ({ ...c, [r.ref]: r.dataUrl }));
    return { ref: r.ref, dataUrl: r.dataUrl };
  };

  // Submitting the new-tab search box navigates (URL or search query, resolved in main), then closes
  // the now-orphaned newtab tab so the result replaces it in place — Chrome's new-tab-page behaviour.
  const onNewTabSearch = useCallback(
    (query: string) => {
      window.tepegoz.navigateTab(query);
      if (activeId !== null) window.tepegoz.closeTab(activeId);
    },
    [activeId],
  );

  return {
    downloadList,
    downloadCommand,
    downloadSubscribe,
    uploadList,
    uploadCommand,
    uploadSubscribe,
    newTabShortcuts,
    onAddShortcut,
    onEditShortcut,
    onRemoveShortcut,
    resolvedNewTabBackground,
    onChangeNewTabBackground,
    onPickNewTabBackgroundImage,
    onNewTabSearch,
  };
}
