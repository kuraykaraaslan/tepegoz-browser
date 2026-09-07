import type { WebContents } from 'electron';
import { z } from 'zod';
import type { ConsoleMessage } from '@tepegoz/browser-tools';

/**
 * P3-d — the per-tab `console.*` recorder behind `browser_get_console`.
 *
 * The page's console is read through the ordinary `webContents` `console-message` event — NOT the
 * `debugger`/DevTools protocol. ADR-0029 keeps DevTools user-only, and this stays outside it: no CDP
 * domain is enabled for this, nothing is executed on the page, and the tool is strictly read-only.
 *
 * One permanent listener per WebContents (idempotent via {@link wired}, so re-attaching on a tab switch
 * cannot double-subscribe) feeds a small bounded ring. Every message is page-controlled: its shape is
 * `safeParse`d at this boundary and a malformed one is dropped, never thrown — a diagnostics nicety must
 * not be able to break driving. The source URL is stripped of credentials/query/fragment at RECORD time
 * so nothing sensitive sits in memory for the life of the tab.
 *
 * Only the `@tepegoz/browser-tools` `ConsoleMessage` TYPE is imported here (erased at runtime) — the
 * recorder pulls in none of that package's runtime, keeping the CDP driver's module graph unchanged.
 */

/** Messages kept per tab. A debugging read wants the recent tail; the rest is slack. */
const MAX_CONSOLE_MESSAGES = 200;
/** Longest message text stored (page-controlled; the tool caps again when rendering). */
const MAX_MESSAGE_CHARS = 2000;
/** Longest source URL stored. */
const MAX_SOURCE_CHARS = 200;

/** Electron's `console-message` event carries these on the event object (new, non-deprecated form). */
const ConsoleEventSchema = z
  .object({
    level: z.enum(['debug', 'info', 'warning', 'error']),
    message: z.string(),
    lineNumber: z.number().int().nonnegative().optional(),
    sourceId: z.string().optional(),
  })
  .passthrough();

/** A source URL reduced to what may be stored: no credentials, no query, no fragment. */
function safeSource(raw: string): string {
  if (raw.length === 0) return '';
  try {
    const u = new URL(raw);
    u.username = '';
    u.password = '';
    u.search = '';
    u.hash = '';
    return u.toString().slice(0, MAX_SOURCE_CHARS);
  } catch {
    return (raw.split(/[?#]/)[0] ?? '').slice(0, MAX_SOURCE_CHARS);
  }
}

const state = new WeakMap<WebContents, ConsoleMessage[]>();
/** WebContents whose permanent listener is already installed (guards re-attach on tab switch). */
const wired = new WeakSet<WebContents>();

function push(log: ConsoleMessage[], message: ConsoleMessage): void {
  log.push(message);
  if (log.length > MAX_CONSOLE_MESSAGES) {
    log.splice(0, log.length - MAX_CONSOLE_MESSAGES);
  }
}

/**
 * Start recording console output on `wc`. Idempotent — calling it on every `ensureAttached` is safe and
 * intended.
 */
export function attachConsoleRecorder(wc: WebContents): void {
  if (wired.has(wc)) return;
  wired.add(wc);
  const log: ConsoleMessage[] = [];
  state.set(wc, log);
  wc.on('console-message', (details: unknown) => {
    const parsed = ConsoleEventSchema.safeParse(details);
    if (!parsed.success) return;
    const { level, message, lineNumber, sourceId } = parsed.data;
    push(log, {
      level,
      text: message.slice(0, MAX_MESSAGE_CHARS),
      source: safeSource(sourceId ?? ''),
      line: lineNumber ?? 0,
      ts: Date.now(),
    });
  });
  wc.once('destroyed', () => {
    state.delete(wc);
  });
}

/**
 * The console messages observed on `wc` at or after `sinceMs` (host clock).
 *
 * An empty array means **nothing was observed** — the tab may never have been attached — and must never
 * be read as "the page logged nothing".
 */
export function consoleSince(wc: WebContents, sinceMs: number): ConsoleMessage[] {
  const log = state.get(wc);
  if (log === undefined) return [];
  return log.filter((m) => m.ts >= sinceMs);
}
