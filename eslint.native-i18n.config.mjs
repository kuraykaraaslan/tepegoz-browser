/**
 * `no-restricted-syntax` entries that hold NATIVE (main-process) surfaces to the same i18n rule the
 * renderer already obeys.
 *
 * Why this exists as its own module rather than inline in `eslint.config.mjs`: a lint gate that has
 * never been shown to FIRE is indistinguishable from one that matches nothing, and a repo-wide config
 * cannot be asserted on. Exporting the selectors lets `apps/desktop/src/main/lib/native-i18n-gate.test.ts`
 * run ESLint over a fixture of the exact defect shapes this rule was written for, so the gate is
 * falsifiable rather than merely present. Named `*.config.mjs` so ESLint's own ignore list skips it.
 *
 * The hole it closes: `i18next/no-literal-string` and the a11y-attribute rule are both `.tsx`-only.
 * Every string ELECTRON draws — OS notifications, message boxes, native context menus, file pickers —
 * lives in `.ts` and was covered by nothing. Five surfaces shipped English-only underneath a green
 * `pnpm lint`, including the cloud-translation CONSENT dialog, and the Translate submenu keyed its
 * labels on `app.getLocale()` (the OS language) rather than the app's own locale preference.
 */

/** Object keys Electron renders as text. */
const TEXT_KEYS = 'label|sublabel|toolTip|title|message|detail|body|checkboxLabel|buttons';

/**
 * The call sites (and typed option locals) whose object literals Electron actually draws.
 *
 * Anchoring on the CALL rather than on the key name is the whole design. `title:`/`message:`/`detail:`
 * are everywhere in zod schemas, journal payloads and LLM tool definitions, where a literal is correct
 * code — matching those key names repo-wide would be the 95%-noise rule that gets disabled rather than
 * obeyed, which is the trade `eslint.config.mjs` already records for the JSX rules.
 */
const HOSTS = [
  // dialog.showMessageBox / showErrorBox / showOpenDialog / showSaveDialog
  "CallExpression[callee.object.name='dialog']",
  // Menu.buildFromTemplate([...]) — native menu and submenu labels
  "CallExpression[callee.property.name='buildFromTemplate']",
  // new Notification({ title, body }) — the OS notification itself
  "NewExpression[callee.name='Notification']",
  // NotificationHost.push({...}) — our own centre/toast/native fan-out
  "CallExpression[callee.object.name='NotificationHost'][callee.property.name='push']",
  // Options built as a named local first, then handed to one of the above:
  //   const opts: MessageBoxOptions = { … }            → typeName.name
  //   const opts: Electron.OpenDialogOptions = { … }   → typeName.right.name (qualified)
  //   const items: MenuItemConstructorOptions[] = [ … ] → elementType.typeName.name
  'VariableDeclarator[id.typeAnnotation.typeAnnotation.typeName.name=/Options$/]',
  'VariableDeclarator[id.typeAnnotation.typeAnnotation.typeName.right.name=/Options$/]',
  'VariableDeclarator[id.typeAnnotation.typeAnnotation.elementType.typeName.name=/Options$/]',
];

export const NATIVE_I18N_MESSAGE =
  'User-facing text on a NATIVE surface (OS notification, message box, native menu, file picker) ' +
  'must come from a dictionary — `mainStrings()` in the main process — not a literal. Electron ' +
  'draws this string as-is, so a literal here is untranslated UI that no renderer-side i18n rule ' +
  'can see.';

/**
 * A key alone is not a safe anchor even under a native call: matching DESCENDANTS of `title:` also
 * reaches `x === 'handoff' ? a : b`, `.replace('{name}', …)` and `.slice(0, 140)` — comparison
 * operands and call arguments, none of which are drawn. Measured on this repo: descendant matching
 * produced 11 findings and all 11 were false. So the chain from the property to the text is walked
 * explicitly, through the node kinds that actually PRODUCE the rendered value.
 */
const VALUE_WRAPPER =
  ':matches(ConditionalExpression, BinaryExpression[operator="+"], LogicalExpression, ArrayExpression)';

/**
 * Wrapper depth 0–2, which covers `title: 'x'`, `title: c ? 'a' : 'b'`, `buttons: ['a', 'b']` and
 * `detail: 'a' + (c ? 'b' : 'c')`. Deeper nesting is NOT reached — an honest bound, and the right side
 * of the trade against a rule that fires on code.
 */
const PATHS = ['', ` > ${VALUE_WRAPPER}`, ` > ${VALUE_WRAPPER} > ${VALUE_WRAPPER}`];

/** `type(string)` keeps numeric literals out: `defaultId: 0` is not text. */
const LITERAL = "Literal[value=type(string)][value!='']";

/**
 * An interpolated title: `` title: `Task failed: ${name}` ``. Flagged only when a STATIC chunk carries
 * two or more Latin letters — `` `${tool}: ${reason}` `` is pure data joined by punctuation and is
 * correct as written, so it must not trip the rule. Only the first two chunks are inspected, which is
 * where a label's own words sit in practice.
 */
const TEMPLATE =
  'TemplateLiteral:matches([quasis.0.value.cooked=/[A-Za-z]{2}/], [quasis.1.value.cooked=/[A-Za-z]{2}/])';

/** The `no-restricted-syntax` option objects, ready to spread after `'error'`. */
export const nativeI18nSelectors = HOSTS.flatMap((host) =>
  PATHS.flatMap((path) =>
    [LITERAL, TEMPLATE].map((leaf) => ({
      selector: `${host} Property[key.name=/^(${TEXT_KEYS})$/]${path} > ${leaf}`,
      message: NATIVE_I18N_MESSAGE,
    })),
  ),
);
