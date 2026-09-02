/**
 * `@tepegoz/omnibox` — the browser address bar (url-bar). Presentational component + the pure
 * inline arithmetic evaluator it uses. Extracted from `apps/desktop` per docs/package-map.md.
 */
export {
  Omnibox,
  type OmniboxProps,
  type OmniboxSecurityLevel,
  type OmniboxSecurityLabels,
} from './omnibox';
export { evaluateOmniboxCalc, type CalcResult } from './omnibox-calc';
export {
  buildOmniboxSuggestions,
  parseOmniboxQuery,
  looksNavigable,
  MAX_OMNIBOX_SUGGESTIONS,
  type OmniboxSuggestion,
  type OmniboxSuggestionKind,
  type OmniboxQuickSettingTarget,
  type OmniboxAction,
  type OmniboxScope,
  type OmniboxQuery,
  type OmniboxTabCandidate,
  type OmniboxHistoryCandidate,
  type OmniboxBookmarkCandidate,
  type OmniboxSuggestSources,
  type OmniboxSuggestLabels,
} from './omnibox-suggest';
export * from './omnibox-commands';
export * from './omnibox-suggest-commands';
