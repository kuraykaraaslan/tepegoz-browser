/**
 * The curated allowlist the Popup Blocker (strict) seeds on first run — well-known origins whose popups
 * are legitimate CORE functionality (OAuth sign-in, payment/3-D-Secure, video calls, opening a document
 * in a new window), NOT the ad-driven auto-popups the blocker exists to stop.
 *
 * Each entry is a full ORIGIN (scheme + host, no path/trailing slash), matched exactly against a page's
 * `new URL(url).origin` in the block decision. The list is seeded ONCE (guarded by `popupBlockerSeeded`)
 * and thereafter fully user-editable in Settings → Popup Blocker — removing a default is permanent, it is
 * never re-added. Kept deliberately tight: reputable services where a blocked popup is a broken feature.
 */
export const DEFAULT_TRUSTED_POPUP_ORIGINS: readonly string[] = [
  // OAuth / SSO sign-in popups
  'https://accounts.google.com',
  'https://login.microsoftonline.com',
  'https://login.live.com',
  'https://appleid.apple.com',
  'https://www.facebook.com',
  'https://github.com',
  'https://gitlab.com',
  'https://www.linkedin.com',
  'https://api.twitter.com',
  'https://auth0.com',
  'https://okta.com',

  // Payments / 3-D Secure
  'https://checkout.stripe.com',
  'https://hooks.stripe.com',
  'https://js.stripe.com',
  'https://www.paypal.com',
  'https://checkout.paypal.com',

  // Video calls / real-time collaboration (open call or huddle windows)
  'https://meet.google.com',
  'https://teams.microsoft.com',
  'https://teams.live.com',
  'https://zoom.us',
  'https://app.slack.com',
  'https://slack.com',
  'https://discord.com',

  // Productivity suites (open a doc / message / event in its own window)
  'https://docs.google.com',
  'https://drive.google.com',
  'https://mail.google.com',
  'https://calendar.google.com',
  'https://outlook.office.com',
  'https://outlook.live.com',
  'https://onedrive.live.com',
  'https://www.notion.so',
  'https://www.figma.com',
  'https://www.dropbox.com',
];
