# @tepegoz/shortcuts

The **one place a keyboard shortcut is defined**. Before this, shortcuts were spread across three
files that couldn't see each other — the main-process `before-input-event` handler (keys that must
work while a *page* has focus), a renderer effect, and the command palette's own listener — each
hardcoding its own modifier test. That meant nothing could detect a collision, nothing could list the
shortcuts for a help surface, and each site spelled the modifier check differently (so `Ctrl+Alt+T`,
a terminal on Linux, also opened a tab). No dependencies; pure; unit-tested.

## Exports

- **`SHORTCUTS`** — the complete `readonly ShortcutSpec[]`. Adding an entry here is what makes a
  shortcut exist; nothing else may bind a global key. Each carries a stable `id` (the i18n key for
  its description) and a **`scope`**: `'main'` for keys that must be caught while a browsed page has
  focus (the chrome never sees them), `'renderer'` for keys the chrome handles.
- **`matchesShortcut(spec, press)`** — **exact** modifier match, present or absent. Alt is opt-in and
  checked when absent, so a `Ctrl`-only shortcut no longer fires for `Ctrl+Alt+<key>` (which collides
  with the OS and with AltGr layouts — and AltGr matters here: on a Turkish-Q keyboard `@ # $ € ₺`
  are all AltGr).
- **`shortcutFor(press, scope)`** — the `ShortcutId` a press triggers, scope-filtered.
- **`pressFromEvent` / `pressFromInput`** — reduce a DOM `KeyboardEvent` or an Electron `Input` to
  the one normalized `KeyPress` shape both sides share.
- **`formatShortcut(spec, platform)`** — render a shortcut the way the platform writes it (`⌘⇧K` on
  macOS, `Ctrl+Shift+K` elsewhere) for a help list or menu.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
