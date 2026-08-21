import type {
  TypoCheckInput,
  TypoCheckResult,
  TypoIgnoredWord,
  TypoIssue,
  TypoLanguage,
  TypoSettings,
} from './types';

export interface TypoDictionaryAdapter {
  correct(word: string): boolean;
  suggest(word: string): string[];
}

export interface TypoAnalyzeDeps {
  dictionaryFor(language: TypoLanguage): TypoDictionaryAdapter | null | undefined;
  now?(): number;
}

interface Range {
  start: number;
  end: number;
}

interface Token {
  text: string;
  start: number;
  end: number;
}

const WORD_RE = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)?/gu;
const TURKISH_CHARS_RE = /[çğıöşüÇĞİÖŞÜ]/;

const COMMON_TR = new Set([
  'bir',
  've',
  'de',
  'da',
  'ile',
  'için',
  'çok',
  'daha',
  'gibi',
  'ama',
  'olarak',
]);

const COMMON_EN = new Set([
  'the',
  'and',
  'is',
  'are',
  'for',
  'with',
  'this',
  'that',
  'from',
  'have',
]);

function addMatches(text: string, ranges: Range[], re: RegExp): void {
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    ranges.push({ start, end: start + match[0].length });
  }
}

export function maskRanges(text: string): Range[] {
  const ranges: Range[] = [];
  addMatches(text, ranges, /```[\s\S]*?```/g);
  addMatches(text, ranges, /`[^`\n]+`/g);
  addMatches(text, ranges, /\bhttps?:\/\/[^\s<>"']+/gi);
  addMatches(text, ranges, /\bwww\.[^\s<>"']+/gi);
  addMatches(text, ranges, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi);
  addMatches(text, ranges, /\\[a-zA-Z]+[*]?(?:\s*(?:\[[^\]]*\]|\{[^{}]*\}))*/g);
  return ranges.sort((a, b) => a.start - b.start);
}

function isMasked(start: number, end: number, ranges: readonly Range[]): boolean {
  return ranges.some((r) => start < r.end && end > r.start);
}

export function tokenizeTypoText(text: string): Token[] {
  const masked = maskRanges(text);
  const tokens: Token[] = [];
  for (const match of text.matchAll(WORD_RE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (!isMasked(start, end, masked)) tokens.push({ text: match[0], start, end });
  }
  return tokens;
}

function lower(word: string, language: TypoLanguage): string {
  try {
    return word.toLocaleLowerCase(language);
  } catch {
    return word.toLowerCase();
  }
}

function ignoredKey(word: string, language: TypoLanguage): string {
  return `${language}:${lower(word, language)}`;
}

function ignoredSet(ignored: readonly TypoIgnoredWord[]): Set<string> {
  const set = new Set<string>();
  for (const item of ignored) {
    const word = item.word.trim();
    const language = item.language.trim();
    if (word.length > 0 && language.length > 0) set.add(ignoredKey(word, language));
  }
  return set;
}

function canSkipToken(token: Token): boolean {
  if (token.text.length <= 1) return true;
  if (/^\p{Lu}+$/u.test(token.text) && token.text.length <= 8) return true;
  return /\d/.test(token.text);
}

export function detectTypoLanguage(text: string, fallback: TypoLanguage): TypoLanguage {
  if (TURKISH_CHARS_RE.test(text)) return 'tr';
  let tr = 0;
  let en = 0;
  for (const token of tokenizeTypoText(text.slice(0, 4000))) {
    const word = token.text.toLowerCase();
    if (COMMON_TR.has(word)) tr += 1;
    if (COMMON_EN.has(word)) en += 1;
  }
  if (tr > en && tr > 1) return 'tr';
  if (en > tr && en > 1) return 'en';
  return fallback;
}

export function normalizeTypoOrigin(value: string): string | null {
  try {
    const parsed = value.includes('://') ? new URL(value) : new URL(`https://${value}`);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isTypoEnabledForOrigin(settings: TypoSettings, originOrUrl?: string): boolean {
  if (!settings.enabled) return false;
  if (originOrUrl === undefined || originOrUrl.trim().length === 0) return true;
  const origin = normalizeTypoOrigin(originOrUrl);
  return origin !== null && !settings.disabledOrigins.includes(origin);
}

export function analyzeTypoText(
  input: TypoCheckInput,
  settings: TypoSettings,
  deps: TypoAnalyzeDeps,
): TypoCheckResult {
  const started = deps.now?.() ?? Date.now();
  const fallbackLanguage = settings.defaultLanguage || 'tr';
  const language =
    input.language !== undefined && input.language.trim().length > 0
      ? input.language
      : settings.autoDetectLanguage
        ? detectTypoLanguage(input.text, fallbackLanguage)
        : fallbackLanguage;
  if (!isTypoEnabledForOrigin(settings, input.origin)) {
    return {
      language,
      issues: [],
      sourcesUsed: [],
      durationMs: (deps.now?.() ?? Date.now()) - started,
    };
  }

  const dictionary = deps.dictionaryFor(language);
  if (dictionary === null || dictionary === undefined) {
    return {
      language,
      issues: [],
      sourcesUsed: [],
      durationMs: (deps.now?.() ?? Date.now()) - started,
    };
  }

  const ignored = ignoredSet(settings.ignoredWords);
  const issues: TypoIssue[] = [];
  for (const token of tokenizeTypoText(input.text)) {
    if (canSkipToken(token)) continue;
    if (ignored.has(ignoredKey(token.text, language))) continue;
    if (dictionary.correct(token.text)) continue;
    const suggestions = dictionary.suggest(token.text).slice(0, 5);
    issues.push({
      id: `dictionary:${token.start}:${token.end}:${token.text}`,
      kind: 'spelling',
      severity: 'warning',
      source: 'dictionary',
      start: token.start,
      end: token.end,
      text: token.text,
      language,
      message: `Possible typo: ${token.text}`,
      suggestions,
    });
  }

  return {
    language,
    issues,
    sourcesUsed: ['dictionary'],
    durationMs: (deps.now?.() ?? Date.now()) - started,
  };
}
