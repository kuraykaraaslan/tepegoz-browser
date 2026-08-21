export type TranslateLanguage = string;
export type TranslateTargetLanguageMode = 'app-locale';
export type TranslateDisplayMode = 'replace';
export type TranslateEngineMode = 'local-first';
export type TranslateCloudFallbackMode = 'ask' | 'allow' | 'deny';
export type TranslateEngineUsed = 'memory' | 'local-llm' | 'external-ai' | 'none';
export type TranslatePageStatus = 'idle' | 'translating' | 'translated' | 'restored' | 'error';
export type TranslateReason = 'selection' | 'page' | 'manual';

export interface TranslateGlossaryTerm {
  id: string;
  source: string;
  target: string;
  sourceLanguage?: TranslateLanguage | undefined;
  targetLanguage?: TranslateLanguage | undefined;
  caseSensitive: boolean;
}

export interface TranslateSettings {
  enabled: boolean;
  autoTranslateForeignPages: boolean;
  targetLanguageMode: TranslateTargetLanguageMode;
  displayMode: TranslateDisplayMode;
  engineMode: TranslateEngineMode;
  cloudFallbackMode: TranslateCloudFallbackMode;
  disabledOrigins: string[];
  glossaryTerms: TranslateGlossaryTerm[];
}

export const DEFAULT_TRANSLATE_SETTINGS: TranslateSettings = {
  enabled: true,
  autoTranslateForeignPages: true,
  targetLanguageMode: 'app-locale',
  displayMode: 'replace',
  engineMode: 'local-first',
  cloudFallbackMode: 'ask',
  disabledOrigins: [],
  glossaryTerms: [],
};

export interface TranslateTextInput {
  text: string;
  sourceLanguage?: TranslateLanguage | undefined;
  targetLanguage?: TranslateLanguage | undefined;
  origin?: string | undefined;
  reason?: TranslateReason | undefined;
}

export interface TranslateTextResult {
  sourceLanguage: TranslateLanguage;
  targetLanguage: TranslateLanguage;
  translatedText: string;
  engine: TranslateEngineUsed;
  durationMs: number;
}

export interface TranslateBatchItem {
  id: string;
  text: string;
}

export interface TranslateBatchInput {
  items: TranslateBatchItem[];
  sourceLanguage?: TranslateLanguage | undefined;
  targetLanguage?: TranslateLanguage | undefined;
  origin?: string | undefined;
  reason?: TranslateReason | undefined;
}

export interface TranslateBatchResultItem {
  id: string;
  text: string;
  translatedText: string;
  engine: TranslateEngineUsed;
}

export interface TranslateBatchResult {
  sourceLanguage: TranslateLanguage;
  targetLanguage: TranslateLanguage;
  items: TranslateBatchResultItem[];
  engine: TranslateEngineUsed;
  durationMs: number;
}

export interface TranslatePageState {
  url: string;
  origin: string;
  sourceLanguage: TranslateLanguage;
  targetLanguage: TranslateLanguage;
  status: TranslatePageStatus;
  translatedItems: number;
  totalItems: number;
  engine: TranslateEngineUsed;
  error: string | null;
  updatedAt: number;
}

export interface TranslateState {
  settings: TranslateSettings;
  activePage: TranslatePageState | null;
}

export interface TranslateCloudFallbackRequest {
  requestId: string;
  origin: string;
  provider: string;
  targetLanguage: TranslateLanguage;
  textCharCount: number;
  reason: TranslateReason;
}

export interface TranslateCloudFallbackResponse {
  requestId: string;
  allow: boolean;
  remember: boolean;
}

export interface TranslateCapabilityHost {
  translateText(input: TranslateTextInput): Promise<TranslateTextResult> | TranslateTextResult;
}

export interface TranslateHostApi {
  getTranslateSettings(): Promise<TranslateSettings>;
  setTranslateSettings(patch: Partial<TranslateSettings>): Promise<TranslateSettings>;
  getTranslateState(): Promise<TranslateState>;
  translateText(input: TranslateTextInput): Promise<TranslateTextResult>;
  startPageTranslation(): Promise<TranslatePageState | null>;
  restorePageOriginal(): Promise<TranslatePageState | null>;
  setTranslateSiteEnabled(origin: string, enabled: boolean): Promise<TranslateSettings>;
  addTranslateGlossaryTerm(term: Omit<TranslateGlossaryTerm, 'id'>): Promise<TranslateSettings>;
  removeTranslateGlossaryTerm(id: string): Promise<TranslateSettings>;
  getActiveTabUrl(): Promise<string | null>;
  onTranslatePageState(callback: (state: TranslatePageState | null) => void): () => void;
  onTranslateCloudFallbackRequest(
    callback: (request: TranslateCloudFallbackRequest) => void,
  ): () => void;
  respondTranslateCloudFallback(response: TranslateCloudFallbackResponse): void;
}
