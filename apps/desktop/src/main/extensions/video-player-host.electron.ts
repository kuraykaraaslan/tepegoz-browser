import { createVideoPlayerHost, VIDEO_PLAYER_EXTENSION_ID } from '@tepegoz/ext-video-player/host';
import { isExtensionEnabled } from '@tepegoz/desktop-ipc';
import PreferenceStore from '@tepegoz/preferences';

/**
 * Main-process wiring for the Unified Player (ext-video-player). The extension-owned host is
 * Electron-free; this shim supplies PreferenceStore persistence and the global extension enablement gate.
 */
const videoPlayerHost = createVideoPlayerHost({
  getPersisted: () => PreferenceStore.getAll().videoPlayer,
  setPersisted: (videoPlayer) => {
    PreferenceStore.update({ videoPlayer });
  },
  isExtensionEnabled: () =>
    isExtensionEnabled(PreferenceStore.getAll().extensions, VIDEO_PLAYER_EXTENSION_ID),
});

export default videoPlayerHost;
