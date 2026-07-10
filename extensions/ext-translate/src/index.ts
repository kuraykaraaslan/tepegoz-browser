export { translateManifest } from './manifest';
export { TranslatePopup, TranslatePage, TranslateControls } from './panel';
export { translateDict, type TranslateStrings } from './i18n';
export {
  TRANSLATE_EXTENSION_ID,
  createTranslateHost,
  type TranslateHost,
  type TranslateHostPorts,
  type TranslateRunBatchInput,
} from './host';
export { translateCapabilities } from './capabilities';
export {
  applyGlossaryTerms,
  createTranslateBatches,
  glossaryTermsFor,
  isTranslateEnabledForOrigin,
  normalizeTranslateLanguage,
  normalizeTranslateOrigin,
  parseTranslateModelResponse,
  resolveTranslateTargetLanguage,
  shouldAutoTranslatePage,
  translationMemoryKey,
} from './engine';
export type {
  TranslateBatchInput,
  TranslateBatchItem,
  TranslateBatchResult,
  TranslateBatchResultItem,
  TranslateCapabilityHost,
  TranslateCloudFallbackMode,
  TranslateCloudFallbackRequest,
  TranslateCloudFallbackResponse,
  TranslateDisplayMode,
  TranslateEngineMode,
  TranslateEngineUsed,
  TranslateGlossaryTerm,
  TranslateHostApi,
  TranslateLanguage,
  TranslatePageState,
  TranslateReason,
  TranslateSettings,
  TranslateState,
  TranslateTargetLanguageMode,
  TranslateTextInput,
  TranslateTextResult,
} from './types';
