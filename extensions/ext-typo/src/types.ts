export const TYPO_LANGUAGES = ['tr', 'en', 'fr', 'es', 'pt', 'de', 'it'] as const;
export type TypoKnownLanguage = (typeof TYPO_LANGUAGES)[number];
export type TypoLanguage = string;

export type TypoLocalLlmMode = 'off' | 'auto';
export type TypoExternalAiMode = 'off' | 'manual';
export type TypoCheckAiMode = 'none' | 'auto' | 'manual';
export type TypoIssueSource = 'dictionary' | 'local-llm' | 'external-ai';
export type TypoIssueKind = 'spelling' | 'grammar' | 'style';
export type TypoIssueSeverity = 'info' | 'warning';
export type TypoDictionaryStatus = 'available' | 'installed' | 'downloading' | 'error';

export interface TypoIgnoredWord {
  word: string;
  language: TypoLanguage;
}

export interface TypoSettings {
  enabled: boolean;
  autoDetectLanguage: boolean;
  languages: TypoLanguage[];
  defaultLanguage: TypoLanguage;
  localLlmMode: TypoLocalLlmMode;
  externalAiMode: TypoExternalAiMode;
  disabledOrigins: string[];
  ignoredWords: TypoIgnoredWord[];
}

export const DEFAULT_TYPO_SETTINGS: TypoSettings = {
  enabled: true,
  autoDetectLanguage: true,
  languages: ['tr', 'en'],
  defaultLanguage: 'tr',
  localLlmMode: 'auto',
  externalAiMode: 'manual',
  disabledOrigins: [],
  ignoredWords: [],
};

export interface TypoIssue {
  id: string;
  kind: TypoIssueKind;
  severity: TypoIssueSeverity;
  source: TypoIssueSource;
  start: number;
  end: number;
  text: string;
  language: TypoLanguage;
  message: string;
  suggestions: string[];
}

export interface TypoCheckInput {
  text: string;
  language?: TypoLanguage | undefined;
  origin?: string | undefined;
  aiMode?: TypoCheckAiMode | undefined;
}

export interface TypoCheckResult {
  language: TypoLanguage;
  issues: TypoIssue[];
  sourcesUsed: TypoIssueSource[];
  durationMs: number;
}

export interface TypoDictionaryFileInfo {
  uri: string;
  sizeBytes: number;
  sha256: string;
}

export interface TypoDictionaryCatalogEntry {
  id: string;
  language: TypoLanguage;
  name: string;
  uri: string;
  sizeBytes: number;
  sha256: string;
  license: string;
  version: string;
  recommended: boolean;
  aff: TypoDictionaryFileInfo;
  dic: TypoDictionaryFileInfo;
}

export interface TypoDictionaryInfo {
  id: string;
  language: TypoLanguage;
  name: string;
  uri: string;
  sizeBytes: number;
  sha256: string;
  license: string;
  version: string;
  recommended: boolean;
  installed: boolean;
  downloading: boolean;
  progress: number;
  status: TypoDictionaryStatus;
  error: string | null;
}

export interface TypoState {
  settings: TypoSettings;
  dictionaries: TypoDictionaryInfo[];
}

export interface TypoCapabilityHost {
  checkTypoText(input: TypoCheckInput): Promise<TypoCheckResult> | TypoCheckResult;
}

export interface TypoHostApi {
  getTypoSettings(): Promise<TypoSettings>;
  setTypoSettings(patch: Partial<TypoSettings>): Promise<TypoSettings>;
  getTypoState(): Promise<TypoState>;
  checkTypoText(input: TypoCheckInput): Promise<TypoCheckResult>;
  listTypoDictionaries(): Promise<TypoDictionaryInfo[]>;
  downloadTypoDictionary(id: string): Promise<void>;
  cancelTypoDictionaryDownload(id: string): void;
  deleteTypoDictionary(id: string): Promise<void>;
  showTypoDictionariesFolder(): Promise<void>;
  setTypoSiteEnabled(origin: string, enabled: boolean): Promise<TypoSettings>;
  addTypoIgnoredWord(word: string, language: TypoLanguage): Promise<TypoSettings>;
  getActiveTabUrl(): Promise<string | null>;
  onTypoDictionariesState(callback: (items: TypoDictionaryInfo[]) => void): () => void;
}
