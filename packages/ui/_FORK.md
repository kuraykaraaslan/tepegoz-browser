# `@tepegoz/ui` — KUIreact fork (drift tracking)

Per the binding UI mandate (internal-ai-rules: KUI_Package_Rules / UI_Interface_Rules), Tepegöz's
renderer is built on **KUIreact** components. They are **forked/copied** into this package — NOT
`npm install`ed — so we control the source and track drift here.

## Upstream source
- Repo: `@kuraykaraaslan/kui-react` at `/home/kuray/kui-react` (WSL), version **1.0.1**.
- Forked on: 2026-06-30.

## What is forked (subset — fork-on-demand)
Only the atoms the current surfaces need are forked; more are pulled in as screens require them.

| Forked file (here) | Upstream path | Transform applied |
|---|---|---|
| `src/libs/utils/cn.ts` | `libs/utils/cn.ts` | verbatim |
| `src/libs/utils/polymorphic.ts` | `libs/utils/polymorphic.ts` | verbatim |
| `src/modules/ui/Button.tsx` | `modules/ui/Button.tsx` | import `@/libs/...` → relative |
| `src/modules/ui/Toggle.tsx` | `modules/ui/Toggle.tsx` | import `@/libs/...` → relative |
| `src/modules/ui/Card.tsx` | `modules/ui/Card.tsx` | import `@/libs/...` → relative |
| `src/modules/ui/Input.tsx` | `modules/ui/Input.tsx` | import `@/libs/...` → relative |
| `src/modules/ui/Badge.tsx` | `modules/ui/Badge.tsx` | import `@/libs/...` → relative |
| `src/modules/ui/AlertBanner.tsx` | `modules/ui/AlertBanner.tsx` | import `@/libs/...` → relative |
| `src/modules/ui/DropdownMenu.tsx` | `modules/ui/DropdownMenu.tsx` | `@/` → relative; React default import → named; a11y + shortcut patches (below) |
| `styles/tokens.css` | `app/globals.css` (token + `@theme inline` subset) | dropped leaflet/quill/sidebar/RTE blocks |

## Local patches (beyond the `@/` → relative rewrite)
Tracked here so a future upstream `diff` is explainable. These were applied after a security/a11y
review flagged real defects in the vendored atoms:
- `Input.tsx`: password show/hide toggle + clear button gained `focus-visible:ring-2
  focus-visible:ring-border-focus rounded` (WCAG 2.2 AA SC 2.4.7 — the upstream had only
  `focus-visible:outline-none`, leaving no visible keyboard focus). Added optional
  `showPasswordLabel` / `hidePasswordLabel` props (default English) so the toggle's accessible name
  can be localized (Turkish first-class); when omitted, behavior is identical to upstream.
- `DropdownMenu.tsx`: (1) a11y — the trigger is now a real `<button>` with `aria-haspopup`/
  `aria-expanded` (upstream wrapped `trigger` in a non-focusable `<div onClick>`, not keyboard-operable
  — WCAG 2.1.1); added `triggerClassName` / `triggerAriaLabel` passthrough. (2) feature — items gained
  an optional right-aligned `shortcut` accelerator hint (icon → flex-1 label → shortcut layout).
  (3) `React, { … }` default import → named `{ …, type ReactNode }` (this fork avoids the React
  default import under `verbatimModuleSyntax`, consistent with the other atoms). (4) `onOpenChange`
  callback so the host can react to open/close (Tepegöz hides the overlaid native `WebContentsView`
  while the menu is open, else it would cover the DOM dropdown).

## Conventions
- The only transform on component sources is rewriting the `@/` path alias to relative imports
  (this fork has no `@/` alias). Otherwise files are copied verbatim (except the Local patches above)
  so a future `diff` against upstream is clean.
- The vendored sources under `src/modules/**` and `src/libs/**` are **excluded from repo ESLint**
  (root `eslint.config.mjs` ignores) — we do not restyle upstream code; drift is tracked here instead.
- `lazy.tsx` (upstream) is intentionally NOT forked — it imports `next/dynamic`, which does not exist
  in the Electron-vite renderer.

## Re-syncing
1. Re-copy the changed upstream file(s), reapply the `@/` → relative rewrite.
2. Update the version + date above.
3. Run `pnpm --filter @tepegoz/ui typecheck`.
