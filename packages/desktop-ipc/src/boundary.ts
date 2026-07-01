/**
 * Error transport for `ipcRenderer.invoke` rejections (ADR-0009). Electron serializes a thrown Error
 * as its message string only, so the main-side boundary ENCODES `{ message, statusCode }` into the
 * message (`"[403] Action blocked by policy"`) and the preload DECODES it back into a typed
 * `IpcBoundaryError` — the renderer receives the structured pair, never a bare string. Dependency-free
 * (no zod) so the sandboxed preload can import it.
 */

/** What the renderer catches from every bridge `invoke` call: the mapped boundary pair, typed. */
export class IpcBoundaryError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'IpcBoundaryError';
    this.statusCode = statusCode;
  }
}

/** Main side: fold the boundary pair into the one field Electron carries across (the message). */
export function encodeBoundaryMessage(message: string, statusCode: number): string {
  return `[${String(statusCode)}] ${message}`;
}

/** Electron prefixes invoke rejections ("Error invoking remote method 'x': Error: …"), so the marker
 *  is searched, not anchored. */
const BOUNDARY_RE = /\[(\d{3})\] ([\s\S]*)$/;

/** Preload side: recover `{ message, statusCode }` from an invoke rejection. Anything without the
 *  encoded marker (bridge unavailable, Electron-internal failure) maps to a 500, mirroring
 *  `toBoundary`'s unknown-error rule. */
export function decodeBoundaryError(err: unknown): IpcBoundaryError {
  const raw = err instanceof Error ? err.message : String(err);
  const match = BOUNDARY_RE.exec(raw);
  const code = match?.[1];
  const message = match?.[2];
  if (code !== undefined && message !== undefined) {
    return new IpcBoundaryError(message, Number(code));
  }
  return new IpcBoundaryError(raw, 500);
}
