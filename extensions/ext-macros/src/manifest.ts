import { defineExtension } from '@tepegoz/extension-sdk';

/**
 * The Macros extension manifest — a modern, deterministic iMacros successor. Validated against the SDK
 * schema at module load. It surfaces as a resizable sidebar ("Macro Studio" — record/run) and an
 * internal page (`tepegoz://com.tepegoz.macros` — "My Macros" manager). Its agent-callable
 * capabilities are declared separately in `capabilities.ts` (ADR-0021) — the manifest stays UI-only.
 */
export const macrosManifest = defineExtension({
  id: 'com.tepegoz.macros',
  name: 'Macros',
  version: '0.1.0',
  description: 'Record, edit, and replay deterministic browser automations — a modern iMacros successor.',
  icon: 'wand-magic-sparkles',
  surfaces: ['sidebar', 'page'],
  actions: { click: 'sidebar', doubleClick: 'page' },
  labels: {
    tr: {
      name: 'Makrolar',
      description: 'Belirlenimci tarayıcı otomasyonlarını kaydet, düzenle ve yeniden oynat — modern iMacros halefi.',
    },
  },
  permissions: ['tabs', 'read-page', 'navigate'],
});
