# @tepegoz/cert-warning-ui

Presentational leaf: the **TLS certificate warning** shown when a site's certificate cannot be
verified — Phase 2c. Electron-free; the certificate details are injected and the decision leaves
through callbacks.

## Why it is shaped this way

- **The safe action is primary, focused, and first.** A stray Enter goes back, not through.
- **The risk is a consequence, not a category.** "Someone could be reading or changing what you send
  to this site" tells a non-specialist what they are agreeing to; "invalid certificate authority"
  does not.
- **Certificate details are labelled evidence, visually subordinate.** The issuer string is chosen by
  whoever presented the certificate, so it must never read as app copy.
- **The dialog says how long proceeding lasts.** Exceptions are in-memory and die with the process;
  the user is told that rather than left to assume it is permanent — or that it is not.

Sensitive sites (banking, crypto, health, password managers) never reach this component. Main
hard-blocks them without offering a choice, because a "continue anyway" button there teaches exactly
the habit the lockout exists to prevent.

## Exports
- **`CertWarning`** — the warning surface.
- **`CertWarningProps`** — the injected-props contract.
- **`certWarningDict`** — this package's `en`/`tr` dictionary.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
