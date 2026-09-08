# @tepegoz/http

The **central axios seam** for all outbound HTTP. Every REST integration builds on this instead of
pulling a vendor SDK, so timeouts, redaction, and error mapping live in one place (framework-agnostic;
no Electron imports).

## Exports

- **`createHttpClient(options)`** — a configured `AxiosInstance`. Sets a default JSON content type and
  a per-request timeout (default 30s, overridable per call), and installs a response interceptor that
  maps every rejection to an `AppError` (see below). Pass `baseURL` / `headers` for a provider client.
  Pass `blockPrivateHosts: true` to enforce the SSRF guard at this seam — a request whose target is
  not a publicly routable http(s) address (loopback / RFC-1918 / link-local / CGNAT / `localhost` /
  cloud metadata) is refused with an `AppError` 400 before it is sent, and every redirect hop is
  re-checked. Off by default; the web-fetch tool host and any future agent-directed-URL client turn
  it on. Literal-address only — DNS rebinding still needs resolve-then-pin at the socket layer.
- **`isPublicHttpUrl(url)`** — the pure predicate behind `blockPrivateHosts`; `@tepegoz/web-tools`
  re-exports it for the `web_get_page` zod refine (defense in depth + a cleaner error for the agent).
- **`http`** — a shared default instance for ad-hoc calls with no base URL / auth.
- **`normalizeHttpError(err)`** — pure axios-error → `AppError` mapper (4xx passthrough, everything
  else → 503; timeouts/cancels → 503) with `Logger.redact` applied to the message. Unit-tested.
- **`HttpMessages`** — constant client messages.

## Usage

```ts
import { createHttpClient } from '@tepegoz/http';

const api = createHttpClient({
  baseURL: 'https://api.example.com',
  headers: { Authorization: `Bearer ${key}` },
});
const res = await api.post('/thing', body, { signal, timeout: 30_000 }); // rejects as AppError on failure
```

Do **not** construct `axios` directly or add a provider SDK — extend this package instead.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
