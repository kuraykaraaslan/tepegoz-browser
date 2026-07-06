/**
 * Built-in User-Agent presets the switcher offers. Each preset resolves to a concrete UA string, or
 * `null` for the browser's own default (Tepegöz's real UA). These are proper product/OS names, so the
 * `label` is NOT localized; only the special "default" entry's label is replaced by an i18n string in
 * the panel. The list is owned entirely by this extension — the host only ever receives the resolved
 * string (or null) and applies it, so it stays agnostic to the catalog.
 */
export interface UserAgentPreset {
  /** Stable id for matching the active selection (kebab-case). */
  id: string;
  /** Display label (product · platform). Not localized — "default" is special-cased in the UI. */
  label: string;
  /** The UA string to apply, or null for the browser default. */
  ua: string | null;
}

export const USER_AGENT_PRESETS: readonly UserAgentPreset[] = [
  { id: 'default', label: 'Default', ua: null },
  {
    id: 'chrome-windows',
    label: 'Chrome · Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  {
    id: 'chrome-macos',
    label: 'Chrome · macOS',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  {
    id: 'edge-windows',
    label: 'Edge · Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  },
  {
    id: 'firefox-windows',
    label: 'Firefox · Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  },
  {
    id: 'safari-macos',
    label: 'Safari · macOS',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  },
  {
    id: 'safari-iphone',
    label: 'Safari · iPhone',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  },
  {
    id: 'chrome-android',
    label: 'Chrome · Android',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  },
  {
    id: 'googlebot',
    label: 'Googlebot',
    ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  },
];

/** The preset whose UA equals `ua` (or the "default" preset when `ua` is null); undefined if custom. */
export function matchPreset(ua: string | null): UserAgentPreset | undefined {
  if (ua === null) return USER_AGENT_PRESETS.find((p) => p.ua === null);
  return USER_AGENT_PRESETS.find((p) => p.ua === ua);
}
