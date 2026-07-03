import { defineExtension } from '@tepegoz/extension-sdk';

/** The Popup Blocker (strict) manifest — validated against the SDK schema at module load. */
export const popupBlockerManifest = defineExtension({
  id: 'com.tepegoz.popup-blocker',
  name: 'Popup Blocker (strict)',
  version: '0.1.0',
  description:
    'Blocks pop-ups by default; allow, open in background, redirect, or trust the site from a notification.',
  icon: 'ban',
  surfaces: ['popup', 'page'],
  actions: { click: 'popup', doubleClick: 'page' },
  labels: {
    tr: {
      name: 'Popup Engelleyici (katı)',
      description:
        'Pop-up’ları varsayılan olarak engeller; bildirimden izin ver, arka planda aç, yönlendir ya da siteye güven.',
    },
  },
  permissions: ['tabs', 'navigate'],
});
