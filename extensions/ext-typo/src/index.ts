export { typoManifest } from './manifest';
export { TypoPopup, TypoPage, TypoControls } from './panel';
export { typoDict, type TypoStrings } from './i18n';
export {
  TYPO_EXTENSION_ID,
  createTypoHost,
  type TypoHost,
  type TypoHostPorts,
} from './host';
export { typoCapabilities } from './capabilities';
export {
  analyzeTypoText,
  detectTypoLanguage,
  isTypoEnabledForOrigin,
  maskRanges,
  normalizeTypoOrigin,
  tokenizeTypoText,
  type TypoDictionaryAdapter,
} from './analyzer';
export type {
  TypoCapabilityHost,
  TypoCheckInput,
  TypoCheckResult,
  TypoDictionaryCatalogEntry,
  TypoDictionaryFileInfo,
  TypoDictionaryInfo,
  TypoHostApi,
  TypoIgnoredWord,
  TypoIssue,
  TypoIssueKind,
  TypoIssueSeverity,
  TypoIssueSource,
  TypoKnownLanguage,
  TypoLanguage,
  TypoSettings,
  TypoState,
} from './types';
