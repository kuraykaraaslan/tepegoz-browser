# @tepegoz/auth-prompt-ui

Presentational leaf: the **HTTP basic/digest authentication dialog** for a 401 (site) or 407 (proxy)
challenge — Phase 2c. Electron-free; the challenge details are injected and the credentials leave
through `onSubmit`. The package stores nothing.

Self-localizes from its own `en`/`tr` dict (ADR-0016) rather than taking `labels`, because the
proxy-vs-site distinction is a wording decision the component makes.

## Why it is shaped this way

It collects credentials, so two details are deliberate:

- **The origin is its own line**, never interpolated into a translated sentence. A long hostname
  inside a sentence can be pushed out of view, and the origin is the user's only defence against a
  page that provoked the challenge to harvest a password.
- **A proxy challenge says so.** "Your VPN wants your password" and "this site wants your password"
  are very different questions and look identical if the dialog does not distinguish them — which
  matters here, because Phase 5 routes tabs through SOCKS tunnels.

The server-supplied `realm` is shown but labelled and visually subordinate: it is attacker-controlled
text and must never read as app copy.

## Exports
- **`AuthPrompt`** — the dialog. Username + masked password, submit and cancel.
- **`AuthPromptProps`** — the injected-props contract.
- **`authPromptDict`** — this package's `en`/`tr` dictionary.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
