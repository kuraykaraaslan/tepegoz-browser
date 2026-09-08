export const en = {
  /** Toolbar / menu row that turns the reading view on and off. */
  toggle: 'Reading view',
  exit: 'Leave reading view',
  readingTime: '{minutes} min read',
  /**
   * Shown when extraction found no article. It names the PAGE as the reason, not the feature: "this
   * page has no article to read" is a fact the user can act on; "reader mode failed" reads like a bug
   * and sends them looking for one.
   */
  noArticleTitle: 'Nothing to read here',
  noArticleBody:
    'This page does not look like an article — reading view works on pages that are mostly text.',
  /** Shown while the page is being read. Extraction is fast; this exists for the slow-page case. */
  working: 'Reading the page…',
  /** Reading-options toolbar: font size and reading theme (the reading surface, not the app theme). */
  optionsLabel: 'Reading options',
  fontDecrease: 'Decrease text size',
  fontIncrease: 'Increase text size',
  /** The visible label on the font-size buttons — a typographic cue, the same in every language. */
  fontDecreaseGlyph: 'A-',
  fontIncreaseGlyph: 'A+',
  themeLabel: 'Reading theme',
  themeLight: 'Light',
  themeSepia: 'Sepia',
  themeDark: 'Dark',
};

export type ReaderStrings = typeof en;
