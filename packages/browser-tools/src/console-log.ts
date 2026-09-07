import { sanitizeContent, wrapUntrustedContent } from '@tepegoz/tool-executor';

/**
 * P3-d — read-only console diagnostics for the built-in `browser_get_console` tool.
 *
 * WebBrain ships `read_console` as one of a read-only diagnostics trio; this is the console half. It is
 * NOT DevTools access and NOT `execute_js` (ADR-0029 stays exactly as decided): the host records the
 * page's own `console.*` output as it happens, and this pure module shapes that bounded log into a
 * model-safe snapshot — every message text is page-controlled, so it is injection-sanitized and fenced
 * as untrusted (AI-5) exactly like a page read, and the instruction to the agent stays OUTSIDE the fence.
 *
 * Absence is silence, never success: an empty log means "nothing was observed" (the tab may never have
 * been attached), not "the page logged nothing" — the same contract the network recorder is built on.
 */

/** Console severities, mirroring Electron's `console-message` levels. */
export type ConsoleLevel = 'debug' | 'info' | 'warning' | 'error';

/** One `console.*` call observed on a tab. */
export interface ConsoleMessage {
  level: ConsoleLevel;
  /** The message text. Page-controlled → untrusted; never rendered without sanitize + fence. */
  text: string;
  /** URL of the log source, with query + fragment stripped at record time (may carry tokens). */
  source: string;
  /** Line number in the source, or 0 when the page did not report one. */
  line: number;
  /** Host-clock ms (`Date.now()`) at which the message was observed. */
  ts: number;
}

/** The model-facing console snapshot. */
export interface ConsoleReport {
  url: string;
  title: string;
  /** Messages included in {@link content} (after the cap). */
  count: number;
  /** Messages observed in the window, before the cap. */
  totalObserved: number;
  /** True when older messages were dropped to fit {@link MAX_REPORTED_CONSOLE}. */
  truncated: boolean;
  /** Counts by level over EVERY observed message (not just the reported tail), so a dropped error is
   *  still visible as a number even when its line was trimmed. */
  levels: Record<ConsoleLevel, number>;
  /** Sanitized, XML-fenced listing of the reported messages — safe to hand to the model. */
  content: string;
}

/** At most this many message lines are rendered — enough to debug, not enough to flood the context. */
export const MAX_REPORTED_CONSOLE = 50;

/** Longest single message text rendered into the listing (page-controlled). */
const MAX_MESSAGE_CHARS = 500;

/** Longest source URL rendered per line. */
const MAX_SOURCE_CHARS = 200;

const LEVELS: readonly ConsoleLevel[] = ['debug', 'info', 'warning', 'error'];

/** The severities at or above `min`, ascending. `levelsAtOrAbove('warning')` ⇒ `['warning','error']`. */
export function levelsAtOrAbove(min: ConsoleLevel): ConsoleLevel[] {
  return LEVELS.slice(LEVELS.indexOf(min));
}

/** A source URL reduced to what may be shown: no credentials, no query, no fragment. */
export function safeConsoleSource(raw: string): string {
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

/** Per-level counts over `messages`. */
function tallyLevels(messages: readonly ConsoleMessage[]): Record<ConsoleLevel, number> {
  const levels: Record<ConsoleLevel, number> = { debug: 0, info: 0, warning: 0, error: 0 };
  for (const m of messages) levels[m.level] += 1;
  return levels;
}

/** One message as a single line: `[error] app.js:42  Uncaught TypeError: x is not a function`. */
function messageLine(m: ConsoleMessage): string {
  const where = safeConsoleSource(m.source);
  const at = where.length > 0 ? ` ${where}${m.line > 0 ? `:${String(m.line)}` : ''}` : '';
  const text = m.text.replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_CHARS);
  return `[${m.level}]${at}  ${text}`;
}

/**
 * Shape a tab's observed console log into a model-safe {@link ConsoleReport}.
 *
 * The listing keeps the MOST RECENT {@link MAX_REPORTED_CONSOLE} messages — the tail is what explains
 * "what just went wrong" — while `levels` is tallied over everything observed, so a trimmed error still
 * shows up as a count. `optionLevels`, when given, filters which severities are listed (the tally still
 * covers all).
 */
export function summarizeConsole(
  messages: readonly ConsoleMessage[],
  pageUrl: string,
  title: string,
  filterLevels?: readonly ConsoleLevel[],
): ConsoleReport {
  const wanted = filterLevels === undefined ? LEVELS : filterLevels;
  const matching = messages.filter((m) => wanted.includes(m.level));
  const totalObserved = matching.length;
  const truncated = totalObserved > MAX_REPORTED_CONSOLE;
  // Oldest first for reading order; drop from the FRONT when over the cap so the newest survive.
  const ordered = matching.slice().sort((a, b) => a.ts - b.ts);
  const reported = truncated ? ordered.slice(ordered.length - MAX_REPORTED_CONSOLE) : ordered;
  const body =
    reported.length === 0 ? '(no console messages observed)' : reported.map(messageLine).join('\n');
  const { text } = sanitizeContent(body);
  return {
    url: pageUrl,
    title,
    count: reported.length,
    totalObserved,
    truncated,
    levels: tallyLevels(matching),
    content: wrapUntrustedContent(text, pageUrl),
  };
}
