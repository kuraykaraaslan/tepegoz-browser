/**
 * The one place a keyboard shortcut is defined.
 *
 * Before this, shortcuts were spread across three files that could not see each other: the main
 * process (`keyboard-shortcuts.ts`, for keys that must work while a PAGE has focus), a renderer effect
 * (`App-effects.ts`), and the command palette's own listener. Each hardcoded its own modifier test.
 * Three consequences, all of which this file exists to remove:
 *
 *  - **Nothing could detect a collision.** Two handlers binding Ctrl+K in different files both fire,
 *    in listener order, and the loser is whichever mounted first. A registry makes that a test.
 *  - **Nothing could list them.** A shortcut nobody can discover is a shortcut most people never use,
 *    and WCAG 2.2's whole posture on keyboard access assumes the keys are findable.
 *  - **Each site spelled the modifier check differently.** `e.ctrlKey || e.metaKey` in one place and
 *    `input.control || input.meta` in another is the same intent written twice, and only one of them
 *    was checking that Alt is NOT held — so Ctrl+Alt+T, which on Linux is a terminal, also opened a tab.
 *
 * Electron's `Input` and the DOM's `KeyboardEvent` carry the same facts under different names, so
 * {@link matchesShortcut} takes the normalized shape and each side adapts once.
 */

/** Where the key has to be caught. This is a fact about focus, not a preference. */
export type ShortcutScope =
  /** Must work while a browsed PAGE has focus — the chrome never sees the key, so main handles it. */
  | 'main'
  /** The chrome has focus (or the surface is part of the chrome). */
  | 'renderer';

export interface ShortcutSpec {
  /** Stable id — the i18n key for the description, and what a collision test reports. */
  id: string;
  /** Lowercase `KeyboardEvent.key` value: 'k', 'f11', ','. Never a keyCode. */
  key: string;
  /** Ctrl on Windows/Linux, Cmd on macOS. One flag, because it is one concept to a user. */
  ctrlOrCmd?: boolean;
  shift?: boolean;
  /**
   * Alt is opt-IN and checked when absent.
   *
   * This is the part that was wrong before: a handler testing only `ctrlKey` also fires for
   * Ctrl+Alt+<key>, which collides with the OS on Linux and with AltGr layouts — and AltGr matters
   * here, because on a Turkish-Q keyboard `@`, `#`, `$`, `€` and `₺` are all AltGr combinations.
   */
  alt?: boolean;
  scope: ShortcutScope;
}

/** The complete set. Adding one here is what makes it exist; nothing else may bind a global key. */
export const SHORTCUTS = [
  { id: 'newTab', key: 't', ctrlOrCmd: true, scope: 'renderer' },
  { id: 'reopenClosedTab', key: 't', ctrlOrCmd: true, shift: true, scope: 'renderer' },
  // `main`, not `renderer`. It was renderer-scope and therefore only fired while the CHROME had
  // focus; while a page had focus — which is most of a browser's life — the key was answered by
  // ELECTRON'S DEFAULT MENU, not by this app. That menu is gone (see `menus/application-menu.ts`),
  // so reload has to be ours or it is nobody's.
  { id: 'reload', key: 'r', ctrlOrCmd: true, scope: 'main' },
  { id: 'settings', key: ',', ctrlOrCmd: true, scope: 'renderer' },
  { id: 'commandPalette', key: 'k', ctrlOrCmd: true, scope: 'renderer' },
  { id: 'find', key: 'f', ctrlOrCmd: true, scope: 'main' },
  { id: 'fullScreen', key: 'f11', scope: 'main' },
  { id: 'exitKiosk', key: 'q', ctrlOrCmd: true, shift: true, scope: 'main' },
  // The three page commands the right-click menu has always LISTED a shortcut for. The commands
  // themselves (`printActive` / `saveActive` / `viewSourceActive`) already existed and worked — only
  // by right-click. Nothing bound the keys, so the menu printed "Ctrl+P" next to a row and pressing
  // Ctrl+P did nothing at all.
  //
  // `main` scope, for the same reason `find` is: the key almost always arrives while the PAGE has
  // focus, and the chrome renderer never sees it there.
  // Ctrl+Shift+N — a new PRIVATE window. `main` scope like the page commands: it must work while a
  // page has focus, which is where a user decides they want the next thing to be private.
  { id: 'newPrivateWindow', key: 'n', ctrlOrCmd: true, shift: true, scope: 'main' },
  { id: 'print', key: 'p', ctrlOrCmd: true, scope: 'main' },
  { id: 'savePage', key: 's', ctrlOrCmd: true, scope: 'main' },
  { id: 'viewSource', key: 'u', ctrlOrCmd: true, scope: 'main' },
  // The four Electron's default menu used to answer, now owned here. Each replaces a binding that
  // either bypassed one of this app's gates or did the wrong thing for a browser:
  //  • devTools   — was Electron's `toggleDevTools` role, which never consulted the sensitive-site
  //                 gate. This is the security fix; see `page-commands.toggleDevToolsGated`.
  //  • hardReload — Phase 1a deliberately left Ctrl+Shift+R alone so it would not be a plain reload;
  //                 the default menu had been answering it as Force Reload the whole time.
  //  • closeTab   — the default menu's `close` role closes the WINDOW. In a browser Ctrl+W closes a
  //                 TAB, and closing a window full of tabs instead is the kind of mistake a user
  //                 cannot undo from muscle memory.
  { id: 'devTools', key: 'i', ctrlOrCmd: true, shift: true, scope: 'main' },
  { id: 'hardReload', key: 'r', ctrlOrCmd: true, shift: true, scope: 'main' },
  { id: 'closeTab', key: 'w', ctrlOrCmd: true, scope: 'main' },
] as const satisfies readonly ShortcutSpec[];

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];

/** A key press, in the one shape both Electron `Input` and DOM `KeyboardEvent` can be reduced to. */
export interface KeyPress {
  key: string;
  ctrlOrCmd: boolean;
  shift: boolean;
  alt: boolean;
}

/**
 * Exact match — every modifier is checked, present or absent.
 *
 * "Exact" is the load-bearing word. A test that only checks the modifiers a shortcut WANTS fires on
 * every superset of them, which is how Ctrl+Shift+T ends up also triggering Ctrl+T.
 */
export function matchesShortcut(spec: ShortcutSpec, press: KeyPress): boolean {
  return (
    press.key.toLowerCase() === spec.key &&
    press.ctrlOrCmd === (spec.ctrlOrCmd ?? false) &&
    press.shift === (spec.shift ?? false) &&
    press.alt === (spec.alt ?? false)
  );
}

/** The shortcut this press triggers, or null. Scope-filtered so main never answers for the renderer. */
export function shortcutFor(press: KeyPress, scope: ShortcutScope): ShortcutId | null {
  const hit = SHORTCUTS.find((s) => s.scope === scope && matchesShortcut(s, press));
  return hit?.id ?? null;
}

/** Adapt a DOM `KeyboardEvent` (renderer side). */
export function pressFromEvent(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): KeyPress {
  return { key: e.key, ctrlOrCmd: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey };
}

/** Adapt an Electron `before-input-event` Input (main side). */
export function pressFromInput(input: {
  key: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}): KeyPress {
  return {
    key: input.key,
    ctrlOrCmd: input.control || input.meta,
    shift: input.shift,
    alt: input.alt,
  };
}

/**
 * Render a shortcut the way the platform writes it, for a help list or a menu.
 *
 * macOS uses the glyphs and no separator; Windows and Linux spell the words and join with `+`. Getting
 * this wrong is small but immediately reads as "not a real Mac app".
 */
export function formatShortcut(spec: ShortcutSpec, platform: string): string {
  const mac = platform === 'darwin';
  const parts: string[] = [];
  if (spec.ctrlOrCmd === true) parts.push(mac ? '⌘' : 'Ctrl');
  if (spec.shift === true) parts.push(mac ? '⇧' : 'Shift');
  if (spec.alt === true) parts.push(mac ? '⌥' : 'Alt');
  parts.push(spec.key.length === 1 ? spec.key.toUpperCase() : spec.key.toUpperCase());
  return parts.join(mac ? '' : '+');
}
