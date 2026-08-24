export const en = {
  title: 'Translate',
  description: 'Local-first translation for full pages and selected text.',
  enabled: 'Enable Translate',
  enabledHint: 'Automatically translate foreign-language pages when possible.',
  currentSite: 'Current site',
  noSite: 'No web site',
  pauseSite: 'Pause here',
  resumeSite: 'Enable here',
  page: 'Page',
  status: 'Status',
  targetLanguage: 'Target language',
  engine: 'Engine',
  localFirst: 'Local first',
  cloudFallback: 'Cloud fallback',
  ask: 'Ask',
  allow: 'Allow',
  deny: 'Deny',
  autoTranslate: 'Auto-translate foreign pages',
  translatePage: 'Translate page',
  restoreOriginal: 'Restore original',
  quickTranslate: 'Quick translate',
  sourcePlaceholder: 'Paste text to translate...',
  translate: 'Translate',
  result: 'Result',
  glossary: 'Glossary',
  glossaryHint: 'Preferred term replacements are applied to matching language pairs.',
  sourceTerm: 'Source',
  targetTerm: 'Target',
  addTerm: 'Add',
  remove: 'Remove',
  glossaryEmpty: 'No glossary terms yet.',
  disabledSites: 'Paused sites',
  disabledSitesEmpty: 'No paused sites.',
  cloudPromptTitle: 'Cloud translation requested',
  cloudPromptText: 'This page needs cloud fallback before translation can continue.',
  allowCloud: 'Allow cloud',
  denyCloud: 'Deny',
  rememberChoice: 'Remember choice',
  items: 'items',
  characters: 'characters',

  /**
   * NATIVE surfaces the desktop main process draws for this extension: the page context-menu submenu
   * and the cloud-fallback CONSENT dialog. They are separate keys from the panel's `cloudPrompt*`
   * above because the native dialog offers a third choice ("not now") that the in-page prompt does
   * not, and its buttons are OS buttons rather than panel controls.
   *
   * A consent dialog is the one string that may never fall back to English: it is where the user
   * grants a page's text to a cloud endpoint, and consent given in a language you do not read is
   * not consent.
   */
  native: {
    menuTitle: 'Translate',
    translatePage: 'Translate page',
    translateSelection: 'Translate selection',
    restoreOriginal: 'Restore original',
    resultTitle: 'Translation result',
    cloudTitle: 'Cloud translation requested',
    cloudMessage: 'A page translation needs cloud fallback.',
    /** `{target}` is a language name, `{count}` an already-locale-formatted number. */
    cloudDetailTarget: 'Target: {target}',
    cloudDetailText: 'Text: {count} characters',
    cloudAllowRemember: 'Allow and remember',
    cloudDenyRemember: 'Deny and remember',
    cloudNotNow: 'Not now',
  },
};

export type TranslateStrings = typeof en;
