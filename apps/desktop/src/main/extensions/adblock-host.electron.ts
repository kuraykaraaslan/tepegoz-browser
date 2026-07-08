import { createAdblockHost, ADBLOCK_EXTENSION_ID } from '@tepegoz/ext-adblock/host';
import { isExtensionEnabled } from '@tepegoz/desktop-ipc';
import PreferenceStore from '@tepegoz/preferences';

/**
 * Main-process wiring for the Adblock Shield extension. The extension-owned host is Electron-free; this
 * shim supplies PreferenceStore persistence and the global extension enablement gate.
 */
const adblockHost = createAdblockHost({
  getPersisted: () => PreferenceStore.getAll().adblock,
  setPersisted: (adblock) => {
    PreferenceStore.update({ adblock });
  },
  isExtensionEnabled: () =>
    isExtensionEnabled(PreferenceStore.getAll().extensions, ADBLOCK_EXTENSION_ID),
});

export default adblockHost;
