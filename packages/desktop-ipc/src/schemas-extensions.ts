import { z } from 'zod';
import { EXTENSION_ID_RE } from '@tepegoz/extension-sdk';

/** `user-agent:set` payload — a UA string to apply, or null to reset to the browser default. */
export const UserAgentSelectionSchema = z.string().max(512).nullable();

/** `popup-blocker:set` payload — a partial settings patch (only provided keys change). */
export const PopupBlockerPatchSchema = z
  .object({
    enabled: z.boolean(),
    showNotifications: z.boolean(),
    trustedOrigins: z.array(z.string().max(2048)).max(500),
  })
  .partial();

/** `popup-blocker:trust` payload — an origin to add to the trust allowlist. */
export const PopupOriginSchema = z.string().min(1).max(2048);

/** `adblock:set` payload — a partial settings patch (only provided keys change). */
export const AdblockPatchSchema = z
  .object({
    enabled: z.boolean(),
    blockingMode: z.literal('ads-and-trackers'),
    cosmeticFiltering: z.boolean(),
    disabledOrigins: z.array(z.string().max(2048)).max(500),
  })
  .partial();

/** `adblock:site-set` payload — enable or pause protection for one http(s) origin. */
export const AdblockSiteEnabledSchema = z.object({
  origin: z.string().min(1).max(2048),
  enabled: z.boolean(),
});

/** `typo:set` payload — a partial settings patch (only provided keys change). */
export const TypoPatchSchema = z
  .object({
    enabled: z.boolean(),
    autoDetectLanguage: z.boolean(),
    languages: z.array(z.string().min(1).max(16)).max(20),
    defaultLanguage: z.string().min(1).max(16),
    localLlmMode: z.enum(['off', 'auto']),
    externalAiMode: z.enum(['off', 'manual']),
    disabledOrigins: z.array(z.string().max(2048)).max(500),
    ignoredWords: z
      .array(
        z.object({
          word: z.string().min(1).max(200),
          language: z.string().min(1).max(16),
        }),
      )
      .max(2000),
  })
  .partial();

/** `typo:check` payload. */
export const TypoCheckInputSchema = z.object({
  text: z.string().min(1).max(50_000),
  language: z.string().min(1).max(16).optional(),
  origin: z.string().max(2048).optional(),
  aiMode: z.enum(['none', 'auto', 'manual']).optional(),
});

export const TypoDictionaryIdSchema = z.string().min(1).max(64);

/** `typo:site-set` payload — enable or pause Typo for one http(s) origin. */
export const TypoSiteEnabledSchema = z.object({
  origin: z.string().min(1).max(2048),
  enabled: z.boolean(),
});

/** `typo:ignored-word-add` payload. */
export const TypoIgnoredWordAddSchema = z.object({
  word: z.string().min(1).max(200),
  language: z.string().min(1).max(16),
});

/** `translate:set` payload — a partial settings patch (only provided keys change). */
export const TranslatePatchSchema = z
  .object({
    enabled: z.boolean(),
    autoTranslateForeignPages: z.boolean(),
    targetLanguageMode: z.literal('app-locale'),
    displayMode: z.literal('replace'),
    engineMode: z.literal('local-first'),
    cloudFallbackMode: z.enum(['ask', 'allow', 'deny']),
    disabledOrigins: z.array(z.string().max(2048)).max(500),
    glossaryTerms: z
      .array(
        z.object({
          id: z.string().min(1).max(128),
          source: z.string().min(1).max(200),
          target: z.string().min(1).max(200),
          sourceLanguage: z.string().min(1).max(16).optional(),
          targetLanguage: z.string().min(1).max(16).optional(),
          caseSensitive: z.boolean(),
        }),
      )
      .max(1000),
  })
  .partial();

/** `translate:text` payload. */
export const TranslateTextInputSchema = z.object({
  text: z.string().min(1).max(50_000),
  sourceLanguage: z.string().min(1).max(16).optional(),
  targetLanguage: z.string().min(1).max(16).optional(),
  origin: z.string().max(2048).optional(),
  reason: z.enum(['selection', 'page', 'manual']).optional(),
});

/** `translate:site-set` payload — enable or pause Translate for one http(s) origin. */
export const TranslateSiteEnabledSchema = z.object({
  origin: z.string().min(1).max(2048),
  enabled: z.boolean(),
});

/** `translate-glossary:add` payload. */
export const TranslateGlossaryAddSchema = z.object({
  source: z.string().min(1).max(200),
  target: z.string().min(1).max(200),
  sourceLanguage: z.string().min(1).max(16).optional(),
  targetLanguage: z.string().min(1).max(16).optional(),
  caseSensitive: z.boolean(),
});

export const TranslateGlossaryIdSchema = z.string().min(1).max(128);

/** `translate-cloud:respond` payload. */
export const TranslateCloudFallbackResponseSchema = z.object({
  requestId: z.string().min(1).max(128),
  allow: z.boolean(),
  remember: z.boolean(),
});

/** `video-player:set` payload — a partial settings patch (only provided keys change). */
export const VideoPlayerPatchSchema = z
  .object({
    enabled: z.boolean(),
    defaultSpeed: z.number().min(0.25).max(4),
    subtitleFontSize: z.enum(['sm', 'md', 'lg', 'xl']),
    theme: z.enum(['light', 'dark', 'auto']),
    autoHideControls: z.boolean(),
    enableKeyboard: z.boolean(),
    disabledOrigins: z.array(z.string().max(2048)).max(500),
    siteScales: z.record(z.string().max(2048), z.number().min(0.5).max(3)),
  })
  .partial();

/** `video-player:site-set` payload — enable or pause the unified player for one http(s) origin. */
export const VideoPlayerSiteEnabledSchema = z.object({
  origin: z.string().min(1).max(2048),
  enabled: z.boolean(),
});

/** `extension:context-menu` payload — the reverse-DNS id of the toolbar icon that was right-clicked. */
export const ExtensionIdSchema = z.string().regex(EXTENSION_ID_RE).max(128);
