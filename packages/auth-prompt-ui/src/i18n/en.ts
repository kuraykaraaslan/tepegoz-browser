export const en = {
  /** Dialog heading. Deliberately names the act ("sign in"), not the site. */
  title: 'Sign in',
  /** Precedes the origin, which is rendered separately so it cannot be styled away. */
  requestedBy: 'This site is asking for a username and password:',
  /** Precedes the server-supplied realm. Server-controlled text — shown, never trusted. */
  realm: 'Realm',
  username: 'Username',
  password: 'Password',
  submit: 'Sign in',
  cancel: 'Cancel',
  /** Shown instead of the site line when the challenge came from a proxy, not the page. */
  proxyWarning: 'A network proxy is asking for these credentials, not the website.',
};

export type AuthPromptStrings = typeof en;
