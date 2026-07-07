export const en = {
  heroEyebrow: 'Welcome to Tepegöz',
  heroHint: 'Local-first browser setup',
  heroTitle: 'A sharper browser, ready in a few small steps.',
  heroBody:
    'Keep your familiar bookmarks and passwords, start locally, and leave room for Tepegöz Account when sync arrives.',
  featureCards: [
    {
      title: 'Browser-first',
      body: 'Tabs, bookmarks, downloads, and settings stay close to the browser you already know.',
    },
    {
      title: 'Local by default',
      body: 'Your setup starts on this device. Account sync is a future opt-in path.',
    },
    {
      title: 'Agent-ready',
      body: 'Automation and assistant features can be enabled after the basics are in place.',
    },
  ],
  stepLabel: 'Setup',
  stepCount: '{current} / {total}',
  steps: {
    welcome: { title: 'Welcome' },
    account: { title: 'Session' },
    import: { title: 'Import' },
    finish: { title: 'Ready' },
  },
  welcomeTitle: 'Let us make this browser feel like yours.',
  welcomeBody:
    'Tepegöz can start clean or bring over the essentials from another browser. The whole flow is skippable and reversible from Settings.',
  welcomeTiles: [
    {
      title: 'Choose your session',
      body: 'Use a local session today; Tepegöz Account is prepared for later.',
    },
    {
      title: 'Bring essentials',
      body: 'Import exported bookmarks and password CSV files when you want them.',
    },
    {
      title: 'Start browsing',
      body: 'Finish setup and Tepegöz opens the normal browser chrome.',
    },
  ],
  accountTitle: 'Tepegöz Account',
  accountBody:
    'Account sign-in will power sync and profile continuity later. For now, the local session is the supported path.',
  soon: 'Soon',
  signIn: 'Sign in with Tepegöz Account',
  localSessionTitle: 'Continue with a local session',
  localSessionBody:
    'Bookmarks, passwords, preferences, and browser data stay in this local profile. This is the default for this version.',
  importSource: 'Import source',
  importSourceHint:
    'Use files exported from {browser}. Direct profile scanning is not used in this version.',
  sources: {
    chrome: 'Google Chrome',
    edge: 'Microsoft Edge',
    firefox: 'Mozilla Firefox',
    brave: 'Brave',
    other: 'Other browser',
  },
  bookmarksTitle: 'Bookmarks',
  bookmarksBody:
    'Drop a browser-exported bookmarks HTML file. Imported items are placed under Other bookmarks.',
  bookmarksAccept: '.html or .htm',
  chooseBookmarks: 'Choose bookmarks file',
  bookmarksImported: '{imported} bookmarks imported. {skipped} skipped.',
  importBookmarksFailed:
    'Bookmarks could not be imported. Check that this is a browser bookmarks HTML export.',
  passwordsTitle: 'Passwords',
  passwordsBody:
    'Drop a password CSV export. Passwords are encrypted into the local vault immediately after import.',
  passwordsAccept: '.csv',
  choosePasswords: 'Choose password CSV',
  passwordsImported: '{imported} passwords imported. {skipped} skipped.',
  importPasswordsFailed:
    'Passwords could not be imported. Check the CSV columns and whether OS encryption is available.',
  importing: 'Importing…',
  finishTitle: 'You are ready.',
  finishBody:
    'Tepegöz will now open the normal browser. You can revisit imports and account options later from Settings.',
  summaryAccount: 'Session',
  summaryLocal: 'Local',
  summaryBookmarks: 'Bookmarks',
  summaryPasswords: 'Passwords',
  summarySkipped: 'Skipped',
  begin: 'Begin',
  continue: 'Continue',
  back: 'Back',
  skipImport: 'Skip import',
  startBrowsing: 'Start browsing',
};

export type OnboardingStrings = typeof en;
