import { createRequire } from 'node:module';
import {
  AnthropicProvider,
  GEMINI_MODEL,
  GeminiProvider,
  KimiProvider,
  LOCAL_MODEL,
  ModelGateway,
  OPENAI_MODEL,
  OpenAIProvider,
  ANTHROPIC_MODEL,
} from '@tepegoz/model-gateway';
import { LocalProvider } from '@tepegoz/local-inference';
import { isExtensionEnabled } from '@tepegoz/desktop-ipc';
import { isRunnableProvider, type AIProvider } from '@tepegoz/shared-types';
import CredentialVault from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import { Logger } from '@tepegoz/libs';
import { createTypoHost, TYPO_EXTENSION_ID } from '@tepegoz/ext-typo/host';
import type {
  TypoCapabilityHost,
  TypoCheckInput,
  TypoCheckResult,
  TypoIssue,
  TypoSettings,
} from '@tepegoz/ext-typo/types';
import { z } from 'zod';
import { llamaEngine } from '../local-inference/llama-engine.electron';
import ModelManager from '../model-catalog/model-manager.electron';
import TypoDictionaryManager from './typo-dictionary-manager.electron';

interface NSpellInstance {
  correct(word: string): boolean;
  suggest(word: string): string[];
}

type NSpellFactory = (aff: string, dic: string) => NSpellInstance;

const require = createRequire(import.meta.url);
let nspellFactory: NSpellFactory | null = null;
const dictionaryCache = new Map<string, { id: string; spell: NSpellInstance }>();

function getNspellFactory(): NSpellFactory {
  if (nspellFactory !== null) return nspellFactory;
  const loaded = require('nspell') as NSpellFactory | { default?: NSpellFactory };
  nspellFactory = typeof loaded === 'function' ? loaded : (loaded.default ?? null);
  if (nspellFactory === null) throw new Error('nspell module did not expose a factory');
  return nspellFactory;
}

function dictionaryFor(language: string): NSpellInstance | null {
  const installed = TypoDictionaryManager.loadInstalled(language);
  if (installed === null) {
    dictionaryCache.delete(language);
    return null;
  }
  const cached = dictionaryCache.get(language);
  if (cached !== undefined && cached.id === installed.id) return cached.spell;
  const spell = getNspellFactory()(installed.aff, installed.dic);
  dictionaryCache.set(language, { id: installed.id, spell });
  return spell;
}

const AiIssueSchema = z.object({
  kind: z.enum(['spelling', 'grammar', 'style']).default('grammar'),
  text: z.string().min(1).max(200),
  start: z.number().int().min(0).optional(),
  end: z.number().int().min(0).optional(),
  message: z.string().min(1).max(500),
  suggestions: z.array(z.string().min(1).max(200)).max(5).default([]),
});

const AiReviewSchema = z.object({
  issues: z.array(AiIssueSchema).max(40).default([]),
});

function modelFor(provider: AIProvider): string {
  if (provider === 'openai') return OPENAI_MODEL.classify;
  if (provider === 'gemini') return GEMINI_MODEL.classify;
  if (provider === 'local') return LOCAL_MODEL.classify;
  return ANTHROPIC_MODEL.classify;
}

function registerLocalProvider(): boolean {
  const engine = llamaEngine();
  const available = engine.isAvailable() && ModelManager.resolveModel() !== null;
  if (!available) return false;
  ModelGateway.register(
    new LocalProvider({ engine, resolveModel: () => ModelManager.resolveModel() }),
  );
  return true;
}

function registerExternalProvider(): AIProvider | null {
  const meta = CredentialVault.listMeta().find((key) => isRunnableProvider(key.provider));
  if (meta === undefined) return null;
  const apiKey = CredentialVault.getFirstKeyForProvider(meta.provider);
  if (apiKey === null) return null;
  if (meta.provider === 'openai') {
    ModelGateway.register(new OpenAIProvider({ apiKey }));
  } else if (meta.provider === 'gemini') {
    ModelGateway.register(new GeminiProvider({ apiKey }));
  } else if (meta.provider === 'kimi') {
    ModelGateway.register(new KimiProvider({ apiKey }));
  } else {
    ModelGateway.register(new AnthropicProvider({ apiKey, effort: 'low' }));
  }
  return meta.provider;
}

function resolveAiRange(
  text: string,
  raw: z.infer<typeof AiIssueSchema>,
): { start: number; end: number } | null {
  const explicitStart = raw.start;
  const explicitEnd = raw.end;
  if (
    explicitStart !== undefined &&
    explicitEnd !== undefined &&
    explicitStart >= 0 &&
    explicitEnd > explicitStart &&
    explicitEnd <= text.length
  ) {
    return { start: explicitStart, end: explicitEnd };
  }
  const found = text.toLocaleLowerCase().indexOf(raw.text.toLocaleLowerCase());
  if (found < 0) return null;
  return { start: found, end: found + raw.text.length };
}

function mergeAiIssues(
  base: TypoCheckResult,
  text: string,
  source: 'local-llm' | 'external-ai',
  rawIssues: Array<z.infer<typeof AiIssueSchema>>,
): TypoCheckResult {
  const seen = new Set(base.issues.map((issue) => `${issue.start}:${issue.end}:${issue.kind}`));
  const issues: TypoIssue[] = [...base.issues];
  for (const raw of rawIssues) {
    const range = resolveAiRange(text, raw);
    if (range === null) continue;
    const key = `${range.start}:${range.end}:${raw.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({
      id: `${source}:${range.start}:${range.end}:${raw.text}`,
      kind: raw.kind,
      severity: raw.kind === 'style' ? 'info' : 'warning',
      source,
      start: range.start,
      end: range.end,
      text: text.slice(range.start, range.end),
      language: base.language,
      message: raw.message,
      suggestions: raw.suggestions,
    });
  }
  const sourcesUsed = [...base.sourcesUsed];
  if (rawIssues.length > 0 && !sourcesUsed.includes(source)) sourcesUsed.push(source);
  return { ...base, issues, sourcesUsed };
}

async function runAiReview(
  input: TypoCheckInput,
  base: TypoCheckResult,
  provider: AIProvider,
  source: 'local-llm' | 'external-ai',
): Promise<TypoCheckResult> {
  const text = input.text.slice(0, 12_000);
  const response = await ModelGateway.complete({
    provider,
    model: modelFor(provider),
    capability: 'classify',
    maxTokens: 1200,
    timeoutMs: provider === 'local' ? 45_000 : 30_000,
    responseFormat: 'json',
    messages: [
      {
        role: 'system',
        content:
          'You are a multilingual writing checker. Return only JSON: ' +
          '{"issues":[{"kind":"spelling|grammar|style","text":"...",' +
          '"start":0,"end":1,"message":"...","suggestions":["..."]}]}. ' +
          'Use zero-based UTF-16 offsets in the provided text. Do not flag code, URLs, emails, ' +
          'Markdown code spans, or LaTeX commands.',
      },
      {
        role: 'user',
        content:
          `Language: ${base.language}\n` +
          `Already found dictionary issues: ${base.issues.map((i) => i.text).join(', ')}\n\n` +
          `Text:\n${text}`,
      },
    ],
  });
  const parsed = AiReviewSchema.safeParse(JSON.parse(response.text));
  if (!parsed.success) return base;
  return mergeAiIssues(base, text, source, parsed.data.issues);
}

async function aiReview(
  input: TypoCheckInput,
  base: TypoCheckResult,
  settings: TypoSettings,
): Promise<TypoCheckResult> {
  if (input.text.trim().length === 0 || input.aiMode === 'none') return base;
  let result = base;
  if (settings.localLlmMode === 'auto' && registerLocalProvider()) {
    try {
      result = await runAiReview(input, result, 'local', 'local-llm');
    } catch (err) {
      Logger.warn('Typo local LLM review failed', { err: String(err) });
    }
  }
  if (input.aiMode === 'manual' && settings.externalAiMode === 'manual') {
    const provider = registerExternalProvider();
    if (provider !== null) {
      try {
        result = await runAiReview(input, result, provider, 'external-ai');
      } catch (err) {
        Logger.warn('Typo external AI review failed', { err: String(err) });
      }
    }
  }
  return result;
}

const typoHost = createTypoHost({
  getPersisted: () => PreferenceStore.getAll().typo,
  setPersisted: (typo) => {
    PreferenceStore.update({ typo });
  },
  isExtensionEnabled: () =>
    isExtensionEnabled(PreferenceStore.getAll().extensions, TYPO_EXTENSION_ID),
  dictionaries: () => TypoDictionaryManager.list(),
  dictionaryFor,
  aiReview,
});

export const typoCapabilityHost: TypoCapabilityHost = {
  checkTypoText: (input) => typoHost.check(input),
};

export default typoHost;
