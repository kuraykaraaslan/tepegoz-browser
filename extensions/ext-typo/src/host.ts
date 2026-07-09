import {
  analyzeTypoText,
  isTypoEnabledForOrigin,
  normalizeTypoOrigin,
  type TypoDictionaryAdapter,
} from './analyzer';
import { typoManifest } from './manifest';
import {
  DEFAULT_TYPO_SETTINGS,
  type TypoCheckInput,
  type TypoCheckResult,
  type TypoDictionaryInfo,
  type TypoSettings,
  type TypoState,
} from './types';

export const TYPO_EXTENSION_ID = typoManifest.id;
const MAX_DISABLED_ORIGINS = 500;
const MAX_IGNORED_WORDS = 2000;

export interface TypoHostPorts {
  getPersisted(): TypoSettings;
  setPersisted(settings: TypoSettings): void;
  isExtensionEnabled(): boolean;
  dictionaries(): TypoDictionaryInfo[];
  dictionaryFor(language: string): TypoDictionaryAdapter | null | undefined;
  aiReview?(input: TypoCheckInput, base: TypoCheckResult, settings: TypoSettings): Promise<TypoCheckResult>;
}

export interface TypoHost {
  init(): void;
  get(): TypoSettings;
  update(patch: Partial<TypoSettings>): TypoSettings;
  state(): TypoState;
  check(input: TypoCheckInput): Promise<TypoCheckResult>;
  setSiteEnabled(origin: string, enabled: boolean): TypoSettings;
  addIgnoredWord(word: string, language: string): TypoSettings;
  isActiveForPage(pageUrlOrOrigin: string): boolean;
}

function uniqueStrings(items: readonly string[], max: number): string[] {
  const clean: string[] = [];
  for (const item of items) {
    const value = item.trim();
    if (value.length > 0 && !clean.includes(value)) clean.push(value);
    if (clean.length >= max) break;
  }
  return clean;
}

function sanitizeSettings(input: TypoSettings): TypoSettings {
  return {
    enabled: input.enabled,
    autoDetectLanguage: input.autoDetectLanguage,
    languages: uniqueStrings(input.languages, 20),
    defaultLanguage: input.defaultLanguage.trim().length > 0 ? input.defaultLanguage.trim() : 'tr',
    localLlmMode: input.localLlmMode,
    externalAiMode: input.externalAiMode,
    disabledOrigins: uniqueStrings(
      input.disabledOrigins
        .map((origin) => normalizeTypoOrigin(origin) ?? '')
        .filter((origin) => origin.length > 0),
      MAX_DISABLED_ORIGINS,
    ),
    ignoredWords: input.ignoredWords
      .map((item) => ({ word: item.word.trim(), language: item.language.trim() }))
      .filter((item) => item.word.length > 0 && item.language.length > 0)
      .slice(0, MAX_IGNORED_WORDS),
  };
}

function cloneSettings(settings: TypoSettings): TypoSettings {
  return {
    enabled: settings.enabled,
    autoDetectLanguage: settings.autoDetectLanguage,
    languages: [...settings.languages],
    defaultLanguage: settings.defaultLanguage,
    localLlmMode: settings.localLlmMode,
    externalAiMode: settings.externalAiMode,
    disabledOrigins: [...settings.disabledOrigins],
    ignoredWords: settings.ignoredWords.map((item) => ({ ...item })),
  };
}

export function createTypoHost(ports: TypoHostPorts): TypoHost {
  let settings = cloneSettings(DEFAULT_TYPO_SETTINGS);

  const persist = (): TypoSettings => {
    ports.setPersisted(settings);
    return cloneSettings(settings);
  };

  return {
    init(): void {
      settings = sanitizeSettings({ ...DEFAULT_TYPO_SETTINGS, ...ports.getPersisted() });
    },

    get(): TypoSettings {
      return cloneSettings(settings);
    },

    update(patch: Partial<TypoSettings>): TypoSettings {
      settings = sanitizeSettings({ ...settings, ...patch });
      return persist();
    },

    state(): TypoState {
      return { settings: cloneSettings(settings), dictionaries: ports.dictionaries() };
    },

    async check(input: TypoCheckInput): Promise<TypoCheckResult> {
      if (!ports.isExtensionEnabled()) {
        return {
          language: input.language ?? settings.defaultLanguage,
          issues: [],
          sourcesUsed: [],
          durationMs: 0,
        };
      }
      const base = analyzeTypoText(input, settings, {
        dictionaryFor: (language) => ports.dictionaryFor(language),
      });
      return (await ports.aiReview?.(input, base, settings)) ?? base;
    },

    setSiteEnabled(origin: string, enabled: boolean): TypoSettings {
      const normalized = normalizeTypoOrigin(origin);
      if (normalized === null) return cloneSettings(settings);
      const disabled = settings.disabledOrigins.filter((item) => item !== normalized);
      settings = {
        ...settings,
        disabledOrigins: enabled ? disabled : [...disabled, normalized].slice(0, MAX_DISABLED_ORIGINS),
      };
      return persist();
    },

    addIgnoredWord(word: string, language: string): TypoSettings {
      const cleaned = word.trim();
      const lang = language.trim() || settings.defaultLanguage;
      if (cleaned.length === 0) return cloneSettings(settings);
      const exists = settings.ignoredWords.some(
        (item) =>
          item.language === lang && item.word.toLocaleLowerCase(lang) === cleaned.toLocaleLowerCase(lang),
      );
      if (!exists) {
        settings = {
          ...settings,
          ignoredWords: [...settings.ignoredWords, { word: cleaned, language: lang }].slice(
            0,
            MAX_IGNORED_WORDS,
          ),
        };
        return persist();
      }
      return cloneSettings(settings);
    },

    isActiveForPage(pageUrlOrOrigin: string): boolean {
      return ports.isExtensionEnabled() && isTypoEnabledForOrigin(settings, pageUrlOrOrigin);
    },
  };
}
