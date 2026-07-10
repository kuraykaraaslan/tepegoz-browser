import { readJsonFile, writeJsonFile } from '@tepegoz/json-store';
import {
  AnthropicProvider,
  ANTHROPIC_MODEL,
  GeminiProvider,
  GEMINI_MODEL,
  KimiProvider,
  KIMI_MODEL,
  LOCAL_MODEL,
  ModelGateway,
  OPENAI_MODEL,
  OpenAIProvider,
} from '@tepegoz/model-gateway';
import { LocalProvider } from '@tepegoz/local-inference';
import { isExtensionEnabled } from '@tepegoz/desktop-ipc';
import { isRunnableProvider, type AIProvider } from '@tepegoz/shared-types';
import CredentialVault from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import {
  createTranslateHost,
  TRANSLATE_EXTENSION_ID,
  type TranslateRunBatchInput,
} from '@tepegoz/ext-translate/host';
import { parseTranslateModelResponse } from '@tepegoz/ext-translate/engine';
import type {
  TranslateBatchResult,
  TranslateCapabilityHost,
  TranslateCloudFallbackRequest,
  TranslateCloudFallbackResponse,
  TranslatePageState,
} from '@tepegoz/ext-translate/types';
import { app, BrowserWindow, dialog, type MessageBoxOptions } from 'electron';
import { z } from 'zod';
import { join } from 'node:path';
import { llamaEngine } from '../local-inference/llama-engine.electron';
import ModelManager from '../model-catalog/model-manager.electron';
import { mainLocale } from '../lib/i18n-main';
import { IpcChannels } from '@tepegoz/desktop-ipc';

const MAX_MEMORY_ENTRIES = 2000;

const MemorySchema = z.object({
  version: z.literal(1),
  entries: z.record(z.string().max(20_000)),
});

type MemoryFile = z.infer<typeof MemorySchema>;

let memory: MemoryFile | null = null;
const pendingFallback = new Map<string, (response: TranslateCloudFallbackResponse) => void>();

function memoryPath(): string {
  return join(app.getPath('userData'), 'translate-memory.json');
}

function loadMemory(): MemoryFile {
  if (memory !== null) return memory;
  const parsed = MemorySchema.safeParse(readJsonFile(memoryPath()));
  memory = parsed.success ? parsed.data : { version: 1, entries: {} };
  return memory;
}

function saveMemory(): void {
  if (memory !== null) writeJsonFile(memoryPath(), memory);
}

function remember(key: string, value: string): void {
  const data = loadMemory();
  if (data.entries[key] === value) return;
  data.entries[key] = value;
  const keys = Object.keys(data.entries);
  while (keys.length > MAX_MEMORY_ENTRIES) {
    const oldest = keys.shift();
    if (oldest !== undefined) delete data.entries[oldest];
  }
  saveMemory();
}

function modelFor(provider: AIProvider): string {
  if (provider === 'openai') return OPENAI_MODEL.classify;
  if (provider === 'gemini') return GEMINI_MODEL.classify;
  if (provider === 'kimi') return KIMI_MODEL.classify;
  if (provider === 'local') return LOCAL_MODEL.classify;
  return ANTHROPIC_MODEL.classify;
}

function localAvailable(): boolean {
  const engine = llamaEngine();
  return engine.isAvailable() && ModelManager.resolveModel() !== null;
}

function registerLocalProvider(): boolean {
  if (!localAvailable()) return false;
  ModelGateway.register(
    new LocalProvider({ engine: llamaEngine(), resolveModel: () => ModelManager.resolveModel() }),
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

function systemPrompt(input: TranslateRunBatchInput): string {
  const glossary =
    input.glossaryTerms.length === 0
      ? 'No glossary terms.'
      : input.glossaryTerms.map((term) => `${term.source} => ${term.target}`).join('\n');
  return (
    'You are a translation engine. Return only JSON with this exact shape: ' +
    '{"items":[{"id":"same id","translatedText":"translation"}]}. ' +
    `Translate from ${input.sourceLanguage ?? 'auto'} to ${input.targetLanguage ?? 'target language'}. ` +
    'Preserve numbers, URLs, code-like tokens, placeholders, whitespace intent, and product names. ' +
    'Use these glossary preferences when applicable:\n' +
    glossary
  );
}

async function runModelBatch(
  provider: AIProvider,
  input: TranslateRunBatchInput,
  engine: 'local-llm' | 'external-ai',
): Promise<TranslateBatchResult> {
  const response = await ModelGateway.complete({
    provider,
    model: modelFor(provider),
    capability: 'extract',
    maxTokens: Math.min(6000, Math.max(800, input.items.reduce((sum, item) => sum + item.text.length, 0) * 2)),
    timeoutMs: provider === 'local' ? 60_000 : 40_000,
    responseFormat: 'json',
    messages: [
      { role: 'system', content: systemPrompt(input) },
      { role: 'user', content: JSON.stringify({ items: input.items }) },
    ],
  });
  const parsed = parseTranslateModelResponse(response.text, input, engine);
  return { ...parsed, durationMs: 0 };
}

async function runLocalBatch(input: TranslateRunBatchInput): Promise<TranslateBatchResult> {
  if (!registerLocalProvider()) throw new Error('No local translation model is available');
  return runModelBatch('local', input, 'local-llm');
}

async function runCloudBatch(input: TranslateRunBatchInput): Promise<TranslateBatchResult> {
  const provider = registerExternalProvider();
  if (provider === null) throw new Error('No cloud AI provider key is available');
  return runModelBatch(provider, input, 'external-ai');
}

function broadcastPageState(state: TranslatePageState | null): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IpcChannels.translatePageState, state);
  }
}

function broadcastCloudRequest(request: TranslateCloudFallbackRequest): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IpcChannels.translateCloudFallbackRequest, request);
  }
}

async function requestCloudFallback(
  request: TranslateCloudFallbackRequest,
): Promise<TranslateCloudFallbackResponse> {
  broadcastCloudRequest(request);
  const rendererResponse = new Promise<TranslateCloudFallbackResponse>((resolve) => {
    pendingFallback.set(request.requestId, resolve);
  });
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  const dialogOptions: MessageBoxOptions = {
      type: 'question',
      buttons: ['Allow and remember', 'Deny and remember', 'Not now'],
      defaultId: 0,
      cancelId: 2,
      title: 'Cloud translation requested',
      message: 'A page translation needs cloud fallback.',
      detail:
        `${request.origin}\n` +
        `Target: ${request.targetLanguage}\n` +
        `Text: ${request.textCharCount.toLocaleString()} characters`,
    };
  const nativeResponse = (win === null ? dialog.showMessageBox(dialogOptions) : dialog.showMessageBox(win, dialogOptions))
    .then((choice): TranslateCloudFallbackResponse => ({
      requestId: request.requestId,
      allow: choice.response === 0,
      remember: choice.response === 0 || choice.response === 1,
    }));
  const timeout = new Promise<TranslateCloudFallbackResponse>((resolve) => {
    const timer = setTimeout(() => {
      resolve({ requestId: request.requestId, allow: false, remember: false });
    }, 120_000);
    timer.unref?.();
  });
  const response = await Promise.race([rendererResponse, nativeResponse, timeout]);
  pendingFallback.delete(request.requestId);
  return response;
}

const translateHost = createTranslateHost({
  getPersisted: () => PreferenceStore.getAll().translate,
  setPersisted: (translate) => {
    PreferenceStore.update({ translate });
  },
  isExtensionEnabled: () =>
    isExtensionEnabled(PreferenceStore.getAll().extensions, TRANSLATE_EXTENSION_ID),
  getResolvedLocale: () => mainLocale(),
  localAvailable,
  runLocalBatch,
  runCloudBatch,
  requestCloudFallback,
  memoryLookup: (key) => loadMemory().entries[key] ?? null,
  memoryStore: remember,
});

export const translateCapabilityHost: TranslateCapabilityHost = {
  translateText: (input) => translateHost.translateText(input),
};

export function setTranslatePageState(state: TranslatePageState | null): void {
  translateHost.setPageState(state);
  broadcastPageState(state);
}

export function respondTranslateCloudFallback(response: TranslateCloudFallbackResponse): void {
  pendingFallback.get(response.requestId)?.(response);
}

export default translateHost;
