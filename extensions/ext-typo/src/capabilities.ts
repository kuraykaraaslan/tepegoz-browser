import { z } from 'zod';
import {
  capability,
  defineCapabilities,
  type ExtensionCapabilitySet,
} from '@tepegoz/extension-sdk';
import { typoManifest } from './manifest';
import type { TypoCapabilityHost } from './types';

const TypoAnalyzeTextArgs = z.object({
  text: z.string().min(1).max(50_000),
  language: z.string().min(1).max(16).optional(),
  origin: z.string().max(2048).optional(),
  aiMode: z.enum(['none', 'auto', 'manual']).optional(),
});

export function typoCapabilities(): ExtensionCapabilitySet<TypoCapabilityHost> {
  return defineCapabilities(typoManifest.id, [
    capability<z.infer<typeof TypoAnalyzeTextArgs>, TypoCapabilityHost>({
      id: 'typo_analyze_text',
      description:
        'Analyze editable text for spelling and writing issues. args: { text: string, language?: string, ' +
        "origin?: string, aiMode?: 'none'|'auto'|'manual' } — returns language, issues, and sources used.",
      dangerClass: 'read',
      aiTask: 'classify',
      localCapable: true,
      category: 'Typo',
      inputSchema: TypoAnalyzeTextArgs,
      handler: (args, host) => host.checkTypoText(args),
    }),
  ]);
}
