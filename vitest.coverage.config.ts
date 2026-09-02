import { defineConfig } from 'vitest/config';

/**
 * Root coverage gate, run as `pnpm coverage` in CI. One vitest pass over every package's unit tests
 * (per-package `turbo run test` stays the day-to-day runner; jsdom tests opt in via their
 * `@vitest-environment` docblock).
 *
 * Named `vitest.coverage.config.ts` ON PURPOSE: vitest walks UP for a `vitest.config.*`, so a plain
 * root config would hijack every package-local `vitest run` (their cwd-relative include would match
 * nothing → "No test files found"). Only `pnpm coverage` loads this file, via --config.
 *
 * SCOPE: every `packages/*` that ships unit tests — 63 of them (62 + `process-ui`, the
 * tepegoz://process Task Manager surface, added 2026-08-28 at S95.6 / B95.45 / F90 / L95.6). It used
 * to list 28, which is the
 * failure mode a coverage gate is most prone to: the boundary drawn around the code that already
 * passes. Left out were `credential-vault` (the key crypto), `human-input`, `notary`, `macro-engine`,
 * `http` and `agent-runtime`, so the number said "80%" about a scope chosen to say 80%.
 *
 * `packages/persistence` rejoined on 2026-08-22. Its exclusion had outlived its reason by one
 * migration: the comment here still said "better-sqlite3 is rebuilt per-runtime, so its tests cannot
 * run in this single Node pass — they run under `pnpm test:electron`", but the database moved to
 * Node's built-in `node:sqlite` and `test:electron` no longer exists. Its 10 test files had been
 * running green under `turbo run test` the whole time and simply were not being measured. Adding them
 * RAISED statements (79.75 → 80.14), which is the tell that the exclusion was never protecting a
 * number — it was just stale.
 *
 * One exclusion remains, and it is not discretionary:
 *  - `packages/ui` — vendored kui-react fork (see packages/ui/_FORK.md), explicitly not repo code.
 *
 * NOT IN SCOPE, said plainly: `apps/desktop`. It ships 47 test files that run under `turbo run test`
 * and are not measured here. This is a real gap, not a definition — measured on 2026-08-22, adding it
 * takes the gate to **S46.63 / B83.17 / F72.08 / L46.63** over 48,618 statements, because the renderer
 * (`App.tsx` and every component) sits near 0% and `src/main` at ~10%. It is recorded in
 * `phases/README.md` as owed work rather than papered over: the README used to claim this gate covered
 * "all of `apps/desktop`", and it never has.
 *
 * THRESHOLDS are the measured floor of the scope, not an aspiration. Ratchet them UP as coverage
 * lands; never widen the exclusion list to protect a number.
 */
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'apps/desktop/src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      // Measured floor on 2026-08-22 with `packages/persistence` back in scope:
      // S80.14 / B85.83 / F86.53 / L80.14 over 238 test files, 0 skipped.
      // Measured on a CLEAN tree, which is the only number CI can reproduce — measuring with
      // work-in-progress present reads ~0.15 high and puts the gate permanently just out of reach.
      // Thresholds are floor(measured), the same rule the previous line used (78.95 → 78). That leaves
      // statements/lines only 0.14 of margin: one uncovered file trips this gate, which is what a
      // ratchet is FOR. If it trips, add the test — do not lower the number back.
      // Worth reading against the gate it replaces (S80 / B70 / F80 / L80 over 28 packages): more than
      // doubling the scope held statements at 80 and RAISED the branch bar by 15, because B70 was slack
      // enough that no package was ever held to it.
      // TWO scopes, each held to its OWN measured floor, and deliberately NO global threshold.
      //
      // Vitest applies glob thresholds IN ADDITION to the global one, never instead of it — its source
      // says so outright: "Global threshold is for all files, even if they are included by glob
      // patterns" (`resolveThresholds`). So a single global bar plus a per-app override does not work:
      // the global bar would be checked against the blend of both scopes, and admitting `apps/desktop`
      // at S12.97 would force it down to ~46 for everyone. Omitting the global keys leaves that group
      // with no thresholds, and Vitest skips a group whose thresholds are all undefined.
      //
      // The blended "Coverage summary" that `text-summary` prints (~S46) is therefore NOT a gate — it is
      // the honest arithmetic of a 24k-statement app sitting next to 24k statements of packages. The two
      // numbers below are the gate.
      thresholds: {
        // The mature scope. Floor(measured 2026-08-22): S80.14 / B85.85 / F86.53 / L80.14.
        'packages/**': { statements: 80, branches: 85, functions: 86, lines: 80 },
        // `apps/desktop` joined the gate on 2026-08-22 at its own floor, which is the only honest way to
        // add it — the alternative was to keep claiming it was covered while it was not measured at all.
        // It entered at S12.97 / B68.62 / F39.43 / L12.97 over 24,326 statements, a scope as large as
        // all 62 packages combined, with 47 test files already running green here unmeasured.
        //
        // Ratcheted five times across 2026-08-22/23 — S13.36 after the IPC boundary, the preload
        // invoke wrapper and the trust-profile host got runtime tests; S14.28 after
        // `ipc-tabs-windows.ts` (397 lines, 0%); S15.32 once the RENDERER stopped being untestable
        // (`App-helpers.ts` + the `FlagSelect` custom listbox, the first jsdom/testing-library suites
        // in this app); S16.81 with the Appearance and Language/Region settings sections; S18.10 /
        // B73.49 / F45.24 with the main-menu model and the transfer-activity popup. `src/components`
        // as a directory went 0% → 17.05%. This can only go up; `packages/**` is untouched by it.
        //
        // Ratcheted again 2026-08-28 to floor(measured) S25.x / B79.58 / F52.42 / L25.x. That
        // session: the zoom indicator, the PDF-viewer `webPreferences` factory, download speed/ETA +
        // retry, and the tepegoz://process Task Manager landed with unit tests; `ipc-find.ts` /
        // `ipc-downloads.ts` / `ipc-process.ts` went 0% → covered (same runtime-harness pattern as
        // `ipc-tabs-windows.electron.test.ts`); `page-commands.ts` + `keyboard-shortcuts.ts` reached
        // full branch coverage (save/reload/kiosk/fullscreen paths that had never run); and
        // `chrome-url.ts`, `launch-at-login.ts`, `popup-window.ts` (placement geometry) and the
        // desktop `download-service-store` shared-state helpers got their first tests.
        //
        // Ratcheted again 2026-09-02 to floor(measured) S38.94 / B84.93 / F57.15 / L38.94, after a
        // parallel two-branch coverage push: MAIN got behavioural suites for the boundary modules
        // whose docblock guarantee had never executed — crash-reporter-boot, database-repair,
        // safe-mode, the five download-service facets, remembered-grant-scope (S9), basic-auth-broker,
        // recovery-notices, chrome-ready, app-surfaces, public-settings-host, power-lifecycle,
        // tabs-popup-policy (the will-navigate scheme guard), hardware-acceleration-boot (fail-safe),
        // application-menu (no devtools/zoom/close role), notification-host, and the ipc-trust +
        // ipc-bookmark-profiles IPC boundaries. RENDERER got ~34 component/hook suites (registry,
        // useExtensionCatalog, the six tepegoz:// page surfaces, ClearBrowsingDataRow,
        // command-palette-host, NetworkRoutesCard, and the settings sections —
        // startup/accessibility/tray/shortcuts/default-browser/agent-controls/adaptors/system).
        //
        // Round 2 of that push (same day) → floor(measured) S42.09 / B85.24 / F59.01 / L42.09:
        // MAIN added tray.ts (idempotent init, show-or-open, quit-intent ordering), window-parked,
        // the ipc-content facade composition, and ipc-tasks (schema-gated delegation + command
        // lowering). RENDERER added the notification/user-menu popups, network add-connection +
        // mcp-servers forms, the file-ops whitelist, downloads, and search-engine validation.
        //
        // Round 3 (same day) → floor(measured) S44.34 / B85.53 / F60.30 / L44.34: MAIN added the
        // S9 skills-library IPC surface (mints the UUID, delete revokes scoped grants) and agent
        // run-control + HITL relay (cancel unblocks pending prompts for that run only). RENDERER
        // added ai-panels cost, the network-privacy connection manager, the site-trust profile
        // list, and the per-key model picker.
        //
        // NOTE 2026-09-02: functions briefly read 63 in round 15 and was ratcheted there, but the next
        // round's partial coverage of tabs-window-discard.ts moved that file from "not instrumented"
        // to "measured with uncovered reviveTab/activate", which legitimately pulled the ratio back
        // under 63. Corrected to floor(measured)=62. Re-earn 63 by covering those two methods.
        //
        // Rounds 11-15 (solo): every preload/api-* bridge slice covered data-driven (channel + wrapped
        // payload shape, on*State subscribe/forward/unsubscribe), then the big ones made exhaustive to
        // protect the function ratio. floor(measured) S48→49 / F62→63 / L48→49.
        //
        // Round 11 (solo): the network / tasks / uploads preload bridge slices (channel + wrapped payload
        // shape, on*State subscribe/forward/unsubscribe). floor(measured) S47→48 / L47→48.
        //
        // Round 10 (solo): the built-in extension registry lifecycle (init-once, read-before-init throw)
        // + the downloads/trust preload bridge slices (channel + payload shape, onDownloadsState
        // subscribe/forward/unsubscribe). floor(measured) F61→62.
        //
        // Rounds 8-9 (solo): WindowTabsGroups + WindowTabsMoves over a real TabStore (createGroup
        // ghost-id filtering, setPinned observer-before-mutation, detach/adopt tear-off with a fresh id).
        // floor(measured) B85→86.
        //
        // Round 7 (solo): the agent-IPC facade + before-quit abort (fail-safe HITL deny), the
        // extension-IPC schema boundary (adblock/typo/user-agent). floor(measured) S46→47 / L46→47.
        //
        // Round 6 (solo): the page context menu (selection cap, wire-context x/y stripping, every wired
        // action route), REAL_PAGE_HOSTS exact set, and the Phase 5 network-state group-route logic
        // (Tor-chained-through-VPN split, dead route, binary status). floor(measured) S45→46 / L45→46.
        //
        // Round 5 (solo): ai-adaptors inventory grouping, the shared agent-IPC helpers (kill-switch,
        // maybeWarnQuota once-on-crossing, safeArgsPreview cap), and on-device model + macros IPC (the
        // com.tepegoz.macros enabled-gate). floor(measured) F60→61.
        //
        // Round 4 (same day, main-process solo after the renderer branch wound down) →
        // floor(measured) S45.03 / B85.61 / F60.62 / L45.03: the "forget this site" +
        // clear-browsing-data IPC (vault never in scope, every browsing partition, partial-failure
        // resilient, journalled), agent conversation-history + active-tab helper IPC (agentPickFiles
        // 5-file/5-MB cap, text vs base64), and the trusted-origin desktop adapter binding.
        'apps/desktop/**': { statements: 49, branches: 86, functions: 62, lines: 49 },
      },
      include: [
        'apps/desktop/src/**',
        'packages/agent-eval/src/**',
        'packages/agent-runtime/src/**',
        'packages/auth-prompt-ui/src/**',
        'packages/bookmarks/src/**',
        'packages/bookmarks-bar/src/**',
        'packages/bookmarks-ui/src/**',
        'packages/browser-chrome/src/**',
        'packages/browser-menu/src/**',
        'packages/browser-tools/src/**',
        'packages/capability-plane/src/**',
        'packages/cert-warning-ui/src/**',
        'packages/clipboard/src/**',
        'packages/credential-vault/src/**',
        'packages/downloads/src/**',
        'packages/downloads-ui/src/**',
        'packages/extension-catalog/src/**',
        'packages/extension-host/src/**',
        'packages/extension-sdk/src/**',
        'packages/extensions-ui/src/**',
        'packages/file-operations/src/**',
        'packages/find-bar/src/**',
        'packages/history-ui/src/**',
        'packages/http/src/**',
        'packages/human-input/src/**',
        'packages/i18n/src/**',
        'packages/journal-tools/src/**',
        'packages/json-store/src/**',
        'packages/libs/src/**',
        'packages/local-inference/src/**',
        'packages/macro-engine/src/**',
        'packages/markdown/src/**',
        'packages/mcp-client/src/**',
        'packages/model-catalog/src/**',
        'packages/model-gateway/src/**',
        'packages/nav-toolbar/src/**',
        'packages/navigation/src/**',
        'packages/newtab-ui/src/**',
        'packages/notary/src/**',
        'packages/notifications/src/**',
        'packages/notifications-ui/src/**',
        'packages/omnibox/src/**',
        'packages/onboarding-ui/src/**',
        'packages/orchestrator/src/**',
        'packages/page-context-menu/src/**',
        'packages/password-core/src/**',
        'packages/password-provider-google-csv/src/**',
        'packages/password-ui/src/**',
        'packages/password-vault/src/**',
        'packages/persistence/src/**',
        'packages/preferences/src/**',
        'packages/process-ui/src/**',
        'packages/recipe-compiler/src/**',
        'packages/screenshots/src/**',
        'packages/security-policy/src/**',
        'packages/settings-ui/src/**',
        'packages/shared-types/src/**',
        'packages/tab-engine/src/**',
        'packages/tab-strip/src/**',
        'packages/tasks/src/**',
        'packages/tool-executor/src/**',
        'packages/uploads/src/**',
        'packages/uploads-ui/src/**',
        'packages/web-tools/src/**',
      ],
      exclude: ['**/*.test.{ts,tsx}', '**/index.ts'],
    },
  },
});
