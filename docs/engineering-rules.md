# Engineering rules (binding)

> **Why this file exists.** Comments across this codebase justify a decision by citing
> `internal-ai-rules` — a ruleset the author maintains outside the repository, across projects. That
> reference is useless to anyone who cannot open it, and a rule nobody outside can read cannot be a rule
> anyone outside can follow. **This document is the in-repo, public statement of the parts that bind
> `tepegoz-browser`.** Where a code comment says "internal-ai-rules", read it as pointing here.
>
> Everything below is enforced by CI, by a linter, or by an accepted ADR — not by review taste. The
> practical checklist form lives in [`../CONTRIBUTING.md`](../CONTRIBUTING.md) and
> [the PR template](../.github/pull_request_template.md); cross-cutting phase gates live in
> [`../phases/README.md`](../phases/README.md).

## 1. Trust boundaries and validation

- **Every untrusted input is parsed with zod `safeParse` at the boundary it enters** — IPC in both
  directions, LLM tool-call arguments, MCP payloads, integration adapters, the event journal, policy
  input. A boundary that trusts its input is a defect even when it currently works.
- **`@tepegoz/shared-types` is the only schema source.** DTOs are derived (`Pick` / `Omit` / `z.infer`),
  never re-declared inline. A second copy of a contract shape stops being a copy the day one side
  changes.
- **The renderer is untrusted.** It displays and relays; it never decides. Autonomy levels, permissions,
  and policy verdicts are enforced in the **main process**, and a renderer-side check is a convenience,
  never the control.

## 2. Errors

`AppError(message, statusCode)` — services **throw**, a single boundary **maps** to
`{ message, statusCode }` ([ADR-0009](adr/0009-boundary-mapping.md)). Handlers do not invent their own
error envelopes, and messages come from a `messages.ts` rather than being written inline at the throw
site, so the same failure reads the same everywhere and can be localized.

## 3. Security

- **Secrets live only in the main process**, encrypted through Electron `safeStorage`. Never in `.env`,
  never in the bundle, never in a log. Logging is redacted at the logger, not at each call site.
- **One secure `createWindow()` factory.** Every `BrowserWindow` is created there, with
  `contextIsolation` on, node integration off, and a typed `contextBridge` surface. A second window
  factory is how a hardening flag silently stops applying to one window.
- **Fail closed.** When a policy, a network binding, or a capability check cannot reach a decision, the
  answer is "no". A fail-open path in a security control is a bug of the same severity as the bypass it
  permits.
- **No untimed outbound call.** All outbound HTTP goes through the central `@tepegoz/http` seam
  (`createHttpClient`), which imposes a per-request timeout and maps failures to redacted `AppError`s.
  Vendor SDKs are not added for services that speak REST.
- The trust model these serve is [`THREAT-MODEL.md`](THREAT-MODEL.md); reporting is
  [`../SECURITY.md`](../SECURITY.md).

## 4. Localization

**i18n from day zero.** Every user-facing string comes from a type-safe dictionary — English-first,
Turkish at **full parity in the same pull request**. Each package and extension owns its dictionary
(`src/i18n/`, `defineDict` + `useT`); only the shared core (`common` / `window` / `errors`) lives in
`@tepegoz/i18n` ([ADR-0016](adr/0016-per-package-i18n.md)). Leaf UI packages take strings as props and
stay string-free. A lint rule (`eslint-plugin-i18next`) fails the build on hardcoded strings in `.tsx`.

Accessibility is part of the same commitment: WCAG 2.2 AA, and a control that changes state announces
what changed.

## 5. TypeScript and file conventions

- **Strict mode, no escape hatches.** No `@ts-ignore`, no `@ts-expect-error`; `any` only in a `catch`.
  The repository currently contains **zero** of each.
- **Files stay ≤ 250 lines.** A file past the limit is split by responsibility, not by cut point.
- **No floating promises**, no silently swallowed rejections.
- Conventions and deviations are recorded in [ADR-0010](adr/0010-ts-tooling-conventions.md).

## 6. Module boundaries

A **modular monolith**: one desktop app over `@tepegoz/*` packages, layered
foundation → utils → storage → policy → model/plan → app. [`dependency-cruiser.cjs`](../dependency-cruiser.cjs)
enforces the layer graph and forbids static import cycles; a new package adds a rule there. Modules do
not reach into each other's internals or write to another module's storage — they talk through typed
contracts. **New work targets a package, not `apps/desktop` growth**
([`package-map.md`](package-map.md), [ADR-0015](adr/0015-package-extraction-roadmap.md)).

## 7. Tests and gates

Every push must survive, locally and in CI on **Windows, macOS, and Linux**:

`typecheck` · `lint` · `test` · `build` · prettier `format:check` · `depcruise` · the coverage gate ·
the doc-link gate · `pnpm audit --audit-level=high` · the Playwright `_electron` smoke against the
**built** app.

Two rules about gates themselves, learned the hard way and worth keeping:

- **A gate that cannot go red is worse than no gate**, because the checkmark reads as a result. The
  dependency audit carried `|| true` for its whole life and was incapable of failing. There are
  currently **zero** waived advisories; an unavoidable one goes in `pnpm.auditConfig.ignoreGhsas` with
  an id and a review date, visible in review.
- **Zero skipped tests.** `describe.skip` / `it.todo` do not merge. A skipped test reads as coverage
  while testing nothing.

New or changed logic is tested on its **sad path** — malformed payload, hostile page, denied permission,
dropped connection — not only on the path where everything works.

## 8. Documentation and decisions

- A decision that shapes the architecture gets an **ADR** in [`adr/`](adr/). Contradicting an accepted
  ADR requires a new ADR, not a quiet edit to the old one.
- [`../phases/`](../phases/) is the roadmap and is ticked as work lands. **Landed code is not a closed
  phase**: a phase closes only when its definition of done passes and the result is recorded in its
  ledger. Status is stated by what was measured, never by what was written.
- Where a promise is partial, it is documented as an honest matrix rather than an "everything works"
  claim. [`known-issues.md`](known-issues.md) is the standing list.

## 9. Commits and attribution

Branch as `<type>/<short-scope>` → self-review PR → `main`; only trivial and reversible changes go
straight to `main`. `origin` is SSH.

**No AI attribution trailers** in commit messages or PR bodies — `Co-Authored-By: Claude`,
`Generated with Claude Code` and the like are rejected by the CI `commit-policy` job. The log records
who is accountable for the change; tooling is not a co-author.

## 10. Deviations

A rule that cannot be met is **recorded, not quietly dropped** —
[ADR-0010](adr/0010-ts-tooling-conventions.md) holds the standing deviation list. An undocumented
deviation is the failure mode this section exists to prevent: it looks identical to compliance right up
until someone depends on the rule holding.
