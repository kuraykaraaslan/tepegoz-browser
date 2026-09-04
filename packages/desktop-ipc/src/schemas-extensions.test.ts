import { describe, expect, it } from 'vitest';
import {
  AdblockPatchSchema,
  AdblockSiteEnabledSchema,
  ExtensionIdSchema,
  PopupBlockerPatchSchema,
  PopupOriginSchema,
  TranslateCloudFallbackResponseSchema,
  TranslateGlossaryAddSchema,
  TranslateGlossaryIdSchema,
  TranslatePatchSchema,
  TranslateSiteEnabledSchema,
  TranslateTextInputSchema,
  TypoCheckInputSchema,
  TypoDictionaryIdSchema,
  TypoIgnoredWordAddSchema,
  TypoPatchSchema,
  TypoSiteEnabledSchema,
  UserAgentSelectionSchema,
  VideoPlayerPatchSchema,
  VideoPlayerSiteEnabledSchema,
} from './schemas-extensions';

/**
 * Runtime (zod) guards for the built-in-extension settings channels (popup-blocker / adblock / typo /
 * translate / video-player) + `user-agent:set` + `extension:context-menu`. Each `*:set` is a
 * `.partial()` merge-patch; each `*:site-set` wraps `(origin, enabled)`; the settings enums are closed.
 */

describe('user-agent:set', () => {
  it('accepts a UA string or null, rejects an over-long one', () => {
    expect(UserAgentSelectionSchema.parse('UA/1')).toBe('UA/1');
    expect(UserAgentSelectionSchema.parse(null)).toBeNull();
    expect(UserAgentSelectionSchema.safeParse('x'.repeat(513)).success).toBe(false);
  });
});

describe('the *:set merge-patch schemas accept a subset and reject a bad value', () => {
  it('popup-blocker', () => {
    expect(PopupBlockerPatchSchema.parse({ enabled: false })).toEqual({ enabled: false });
    expect(PopupBlockerPatchSchema.parse({})).toEqual({});
    expect(PopupBlockerPatchSchema.safeParse({ enabled: 'no' }).success).toBe(false);
  });

  it('adblock — blockingMode is a fixed literal', () => {
    expect(AdblockPatchSchema.parse({ cosmeticFiltering: true })).toMatchObject({
      cosmeticFiltering: true,
    });
    expect(AdblockPatchSchema.safeParse({ blockingMode: 'ads-only' }).success).toBe(false);
  });

  it('typo — localLlmMode / externalAiMode enums', () => {
    expect(TypoPatchSchema.parse({ enabled: true, localLlmMode: 'auto' })).toMatchObject({
      localLlmMode: 'auto',
    });
    expect(TypoPatchSchema.safeParse({ externalAiMode: 'always' }).success).toBe(false);
  });

  it('translate — cloudFallbackMode enum + fixed literals', () => {
    expect(TranslatePatchSchema.parse({ cloudFallbackMode: 'deny' })).toMatchObject({
      cloudFallbackMode: 'deny',
    });
    expect(TranslatePatchSchema.safeParse({ engineMode: 'cloud-first' }).success).toBe(false);
  });

  it('video-player — defaultSpeed range + subtitleFontSize enum + siteScales record', () => {
    expect(
      VideoPlayerPatchSchema.parse({ defaultSpeed: 1.5, siteScales: { 'https://x.test': 2 } }),
    ).toMatchObject({ defaultSpeed: 1.5 });
    expect(VideoPlayerPatchSchema.safeParse({ defaultSpeed: 10 }).success).toBe(false);
    expect(VideoPlayerPatchSchema.safeParse({ subtitleFontSize: 'xxl' }).success).toBe(false);
  });
});

describe('the *:site-set schemas wrap (origin, enabled)', () => {
  it.each([
    ['adblock', AdblockSiteEnabledSchema],
    ['typo', TypoSiteEnabledSchema],
    ['translate', TranslateSiteEnabledSchema],
    ['video-player', VideoPlayerSiteEnabledSchema],
  ])('%s', (_n, schema) => {
    expect(schema.parse({ origin: 'https://x.test', enabled: true })).toEqual({
      origin: 'https://x.test',
      enabled: true,
    });
    expect(schema.safeParse({ origin: '', enabled: true }).success).toBe(false);
    expect(schema.safeParse({ origin: 'https://x.test' }).success).toBe(false);
  });
});

describe('the typo / translate action payloads', () => {
  it('PopupOriginSchema is a bounded origin string', () => {
    expect(PopupOriginSchema.parse('https://x.test')).toBe('https://x.test');
    expect(PopupOriginSchema.safeParse('').success).toBe(false);
  });

  it('TypoCheckInputSchema / TranslateTextInputSchema — text required, aiMode / reason enums', () => {
    expect(TypoCheckInputSchema.parse({ text: 'teh', aiMode: 'auto' })).toMatchObject({
      aiMode: 'auto',
    });
    expect(TypoCheckInputSchema.safeParse({ text: '', aiMode: 'auto' }).success).toBe(false);
    expect(TranslateTextInputSchema.parse({ text: 'hi', reason: 'selection' })).toMatchObject({
      reason: 'selection',
    });
    expect(TranslateTextInputSchema.safeParse({ text: 'hi', reason: 'telepathy' }).success).toBe(
      false,
    );
  });

  it('the small id + word-add + glossary + cloud-respond schemas', () => {
    expect(TypoDictionaryIdSchema.parse('en-US')).toBe('en-US');
    expect(TypoIgnoredWordAddSchema.parse({ word: 'teh', language: 'en' })).toMatchObject({
      word: 'teh',
    });
    expect(
      TranslateGlossaryAddSchema.parse({ source: 'a', target: 'b', caseSensitive: false }),
    ).toMatchObject({ caseSensitive: false });
    expect(TranslateGlossaryIdSchema.parse('g1')).toBe('g1');
    expect(
      TranslateCloudFallbackResponseSchema.parse({ requestId: 'r1', allow: true, remember: false }),
    ).toMatchObject({ allow: true });
    expect(
      TranslateGlossaryAddSchema.safeParse({ source: 'a', target: 'b' }).success,
    ).toBe(false); // caseSensitive required
  });
});

describe('ExtensionIdSchema', () => {
  it('requires a reverse-DNS id and rejects a plain word', () => {
    expect(ExtensionIdSchema.parse('com.vendor.name')).toBe('com.vendor.name');
    expect(ExtensionIdSchema.safeParse('notreversedns').success).toBe(false);
  });
});
