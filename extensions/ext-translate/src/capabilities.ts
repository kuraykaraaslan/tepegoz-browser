import { z } from 'zod';
import { capability, defineCapabilities, type ExtensionCapabilitySet } from '@tepegoz/extension-sdk';
import { translateManifest } from './manifest';
import type { TranslateCapabilityHost } from './types';

const TranslateTextArgs = z.object({
  text: z.string().min(1).max(50_000),
  sourceLanguage: z.string().min(1).max(16).optional(),
  targetLanguage: z.string().min(1).max(16).optional(),
  origin: z.string().max(2048).optional(),
  reason: z.enum(['selection', 'page', 'manual']).optional(),
});

export function translateCapabilities(): ExtensionCapabilitySet<TranslateCapabilityHost> {
  return defineCapabilities(translateManifest.id, [
    capability<z.infer<typeof TranslateTextArgs>, TranslateCapabilityHost>({
      id: 'translate_translate_text',
      description:
        'Translate text. args: { text: string, sourceLanguage?: string, targetLanguage?: string, ' +
        "origin?: string, reason?: 'selection'|'page'|'manual' } — returns translatedText and engine.",
      dangerClass: 'read',
      aiTask: 'extract',
      localCapable: true,
      category: 'Translate',
      inputSchema: TranslateTextArgs,
      handler: (args, host) => host.translateText(args),
    }),
  ]);
}
