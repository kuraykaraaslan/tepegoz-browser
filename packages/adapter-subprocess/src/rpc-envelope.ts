import { z } from 'zod';

/**
 * ADR-0048 §3: the wire shape between the parent process and an adapter subprocess is a typed RPC
 * envelope carrying the CONSUMING EXTENSION'S OWN adapter interface (e.g. `ChatAdapter`'s connect /
 * roster / send / events), never MCP's `tools/call` semantics — this is what that envelope IS.
 * Newline-delimited JSON over stdio: simple, dependency-free, and every line is `safeParse`d against
 * one of the schemas below before anything downstream trusts it — a subprocess crossed a process
 * boundary, not a trust boundary; it is exactly as untrusted as a native adapter's raw wire event
 * (`ChatAdapter`'s own event stream already gets the same treatment via `normalizeEvent`).
 */

/** Parent → child: invoke one method (`ChatAdapter.sendMessage`, `.history`, …) with its arguments. */
export interface RpcRequest {
  id: string;
  method: string;
  params?: unknown;
}

/** Child → parent: a call succeeded. */
export const RpcResponseOkSchema = z.object({
  id: z.string().min(1).max(128),
  result: z.unknown(),
});
export type RpcResponseOk = z.infer<typeof RpcResponseOkSchema>;

/** Child → parent: a call failed. `message` only — never a raw stack, which may hold paths/secrets
 *  the parent has to redact before it ever reaches a log (mirrors `McpConnection`'s convention of
 *  never forwarding a server's message verbatim). */
export const RpcResponseErrSchema = z.object({
  id: z.string().min(1).max(128),
  error: z.object({ message: z.string().max(4096) }),
});
export type RpcResponseErr = z.infer<typeof RpcResponseErrSchema>;

export const RpcResponseSchema = z.union([RpcResponseOkSchema, RpcResponseErrSchema]);
export type RpcResponse = z.infer<typeof RpcResponseSchema>;

/** Child → parent, unsolicited: a live event (`ChatAdapter.events()`'s stream, reshaped for the wire).
 *  `params` is validated by the CALLER against the specific adapter interface's event schema — this
 *  envelope only proves the frame is shaped like an event at all. */
export const RpcEventSchema = z.object({
  event: z.string().min(1).max(128),
  params: z.unknown().optional(),
});
export type RpcEvent = z.infer<typeof RpcEventSchema>;

/** Any frame the child may send, before we know which kind it is — the TYPE union is what
 *  {@link decodeFrame} returns; do not `safeParse` a raw frame against this schema directly. Because
 *  `result`/`error` are typed loosely, an object missing `result` entirely still satisfies
 *  {@link RpcResponseOkSchema} (a missing key parses as `undefined`, which `z.unknown()` accepts), so
 *  a zod union tries that arm first and can misclassify an error frame or a bare `{ id }` as an
 *  ok-response. {@link decodeFrame} dispatches on key presence instead, which has no such ambiguity —
 *  use it, not this schema, to parse an actual wire frame. */
export const RpcInboundSchema = z.union([RpcResponseOkSchema, RpcResponseErrSchema, RpcEventSchema]);
export type RpcInbound = z.infer<typeof RpcInboundSchema>;

export function isRpcEvent(frame: RpcInbound): frame is RpcEvent {
  return 'event' in frame;
}

export function isRpcResponseOk(frame: RpcInbound): frame is RpcResponseOk {
  return 'result' in frame;
}

/** One outbound line, ready to write to the child's stdin. */
export function encodeFrame(frame: RpcRequest): string {
  return `${JSON.stringify(frame)}\n`;
}

/**
 * `safeParse` one inbound line (already split from the stream) against whichever of the three frame
 * schemas actually applies. `null` on malformed JSON or a shape matching none of them — never
 * throws, since the child is untrusted input exactly like a hostile server's wire.
 *
 * Dispatches on key PRESENCE (`'result' in obj`), not `RpcInboundSchema.safeParse` directly: with
 * `result`/`error` typed `z.unknown()`/an object, a zod union tries `RpcResponseOkSchema` first and
 * that schema is satisfied by an object with NO `result` key at all (a missing key parses as
 * `undefined`, which `z.unknown()` accepts) — so `{ id: '1' }` alone, or even an error frame, would
 * silently parse as a valid ok-response with an undefined result. Checking presence first, then
 * validating against the one matching schema, has no such ambiguity.
 */
export function decodeFrame(line: string): RpcInbound | null {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null) return null;
  const obj = json as Record<string, unknown>;

  if ('event' in obj) {
    const parsed = RpcEventSchema.safeParse(obj);
    return parsed.success ? parsed.data : null;
  }
  if ('result' in obj) {
    const ok = RpcResponseOkSchema.safeParse(obj);
    return ok.success ? ok.data : null;
  }
  if ('error' in obj) {
    const err = RpcResponseErrSchema.safeParse(obj);
    return err.success ? err.data : null;
  }
  return null;
}

/** Bounds a single buffered line so a child that never sends `\n` (or floods one enormous line)
 *  cannot grow the parent's memory without limit — the same "incremental, bounded, fail-closed"
 *  convention `XmlStreamParser` already applies to a hostile XMPP peer. */
export const MAX_LINE_BYTES = 1024 * 1024; // 1 MiB

/**
 * Accumulates raw stdout chunks and yields complete, newline-terminated lines. A line exceeding
 * {@link MAX_LINE_BYTES} is dropped (not buffered forever) and reported via `overflow` so the caller
 * can log/restart rather than silently losing frames forever on a single runaway line.
 */
export class LineBuffer {
  private buf = '';
  private overflowed = false;

  /** Feed a chunk; returns every complete line it produced (may be empty). */
  push(chunk: string): { lines: string[]; overflow: boolean } {
    this.buf += chunk;
    const lines: string[] = [];
    let overflow = false;
    for (;;) {
      const nl = this.buf.indexOf('\n');
      if (nl === -1) break;
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (line.length > 0) lines.push(line);
    }
    if (this.buf.length > MAX_LINE_BYTES) {
      this.buf = '';
      this.overflowed = true;
      overflow = true;
    }
    return { lines, overflow };
  }

  /** Whether a line has ever been dropped for exceeding {@link MAX_LINE_BYTES}. */
  hasOverflowed(): boolean {
    return this.overflowed;
  }
}
