/**
 * AppError contract (internal-ai-rules): services THROW AppError; a single boundary
 * (IPC handler / tool-call / MCP) catches and maps to { message, statusCode }.
 * Status codes keep HTTP semantics even though there is no HTTP route in Electron.
 *
 * ── Two audiences, one error ──────────────────────────────────────────────────────────────────────
 * `message` is OPERATOR- and AGENT-facing and stays English on purpose. It is what lands in the log,
 * and — for browser tools — what the reactor feeds back to the model as an observation. Worse,
 * `orchestrator/recovery.ts` REGEX-MATCHES this text to pick recovery advice (stale-selector,
 * no-active-page). Localizing it would break agent recovery in a Turkish locale and hand the model
 * Turkish tool errors inside an English prompt.
 *
 * `code` is the optional i18n key for the HUMAN boundary. The IPC layer resolves it against the
 * active locale, so the renderer shows a translated string while the log and the model keep the
 * precise English one. This is what the per-package `messages.ts` files already promised — "Operator/log-facing;
 * user-facing strings go through i18n at the boundary" — and what was never actually wired: `toBoundary`
 * passed `err.message` through verbatim, so the entire error surface of a Turkish-first-class product
 * was English, and internal detail ('Quarantine file is missing') leaked to an untrusted renderer.
 *
 * An error with no `code` behaves exactly as before, so adopting this is incremental rather than a
 * flag day.
 */
export class AppError extends Error {
  readonly statusCode: number;
  /** i18n key under the shared `errors` namespace, resolved at the human-facing boundary. */
  readonly code: string | undefined;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface BoundaryResult {
  message: string;
  statusCode: number;
}

/** Resolves an {@link AppError.code} to text in the caller's active locale. */
export type ErrorLocalizer = (code: string) => string | undefined;

/**
 * Map any thrown value to a structured boundary result (unknown → 500).
 *
 * Pass `localize` at a boundary that faces a PERSON (IPC → renderer). Omit it at boundaries that face
 * the model or the log, so the English text the reactor's recovery matching depends on survives intact.
 */
export function toBoundary(err: unknown, localize?: ErrorLocalizer): BoundaryResult {
  if (err instanceof AppError) {
    const localized =
      err.code !== undefined && localize !== undefined ? localize(err.code) : undefined;
    return { message: localized ?? err.message, statusCode: err.statusCode };
  }
  return { message: 'Internal error', statusCode: 500 };
}
