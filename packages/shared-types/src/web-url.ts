/**
 * What counts as an address this browser is willing to store and later navigate to.
 *
 * Three preferences carry a URL the app eventually loads on the user's behalf — the homepage, the
 * kiosk address, and a custom search engine's template — and all three used to be validated as
 * "a string, under N characters". A custom engine only had to contain `{q}`, which
 * `javascript:alert(1)?q={q}` satisfies; stored once, it became a scheme the omnibox would run.
 *
 * So the check lives here, next to the schemas, and is the same check on both sides: the settings form
 * uses it to explain the refusal, and `PreferencesSchema` uses it to make the refusal binding. A rule
 * enforced only in the form is not enforced — the preference write is an IPC boundary, and a doctored
 * payload never goes near the form.
 */

/** The only schemes a stored, user-navigable address may use. */
const NAVIGABLE_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * True for an absolute `http`/`https` URL. Deliberately strict about being ABSOLUTE: a relative string
 * would resolve against whatever page happened to be open, which is not a homepage.
 */
export function isNavigableWebUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return NAVIGABLE_PROTOCOLS.has(parsed.protocol);
}

/**
 * True for a search template that carries exactly the `{q}` placeholder and resolves to an http/https
 * URL once it is filled in.
 *
 * The placeholder is substituted before parsing rather than stripped, because `{` and `}` are not
 * valid URL characters and a parse of the raw template would reject every legitimate engine. The
 * substitute is a plain token: it must not itself introduce structure that changes how the rest of the
 * template parses.
 */
export function isSafeSearchTemplate(value: string): boolean {
  if (!value.includes('{q}')) return false;
  return isNavigableWebUrl(value.replaceAll('{q}', 'q'));
}

/**
 * Best-effort repair of what a person types into a URL field: `example.com` becomes
 * `https://example.com`. Returns the input unchanged when it already carries a scheme or when there is
 * nothing to repair — this is a convenience, never a way to pass {@link isNavigableWebUrl}. A
 * `javascript:` string comes back as-is and still fails validation.
 */
export function normalizeWebUrlInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.includes('://')) return trimmed;
  // A bare scheme with no `//` (`javascript:`, `mailto:`) is left alone: prefixing it would invent an
  // address the user did not type, and it has to fail validation rather than be quietly rewritten.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
