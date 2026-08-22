export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Secret/PII redaction. The Event Journal and the Live Agent Console both route through `Logger`
 * (plan §13.9), and the project rule is that secrets never reach a log.
 *
 * Redaction happens on TWO axes, because either one alone leaves a hole big enough to drive a
 * credential through:
 *
 *  - **By value shape** ({@link SECRET_PATTERNS}) — catches a key pasted into free text, a bearer
 *    header echoed into a message, a JWT in a URL. It cannot catch a secret it has no pattern for,
 *    and it never will: an opaque 32-character vendor key is indistinguishable from an id.
 *  - **By field name** ({@link SECRET_KEYS}) — catches the far more likely case, which is a caller
 *    passing the secret as structured metadata: `Logger.info('...', { apiKey })`. This is the axis
 *    that was missing. Every password in the credential vault is opaque by construction, so no value
 *    pattern could ever have caught one; the field it travels in is what identifies it.
 *
 * The field-name axis fails CLOSED in the sense that matters: a field is redacted whenever its name
 * contains a secret word, so `userApiKey`, `api_key`, and `Authorization` are all caught without
 * anyone maintaining a list of exact spellings.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{16,}/g, // Anthropic
  /sk-or-v1-[A-Za-z0-9_-]{16,}/g, // OpenRouter (before the generic sk- rule, which is shorter)
  /sk-[A-Za-z0-9]{20,}/g, // OpenAI-style (also Moonshot/Kimi, DeepSeek)
  /AIza[A-Za-z0-9_-]{20,}/g, // Google API key
  /gsk_[A-Za-z0-9]{20,}/g, // Groq
  /xai-[A-Za-z0-9]{20,}/g, // xAI
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /xox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /Bearer\s+[A-Za-z0-9._-]{16,}/g, // bearer tokens
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
];

/**
 * Field-name fragments that mark a value as secret. Matched case-insensitively as a SUBSTRING, so one
 * entry covers every spelling a caller might reach for.
 *
 * `key` on its own is deliberately absent: it is a legitimate field name all over this codebase (the
 * kv store, keyboard shortcuts, React list keys), and redacting those would turn logs into noise
 * without protecting anything — the secret spellings are covered by `apikey`/`privatekey`/`secret`.
 */
const SECRET_KEYS: readonly string[] = [
  'apikey',
  'api_key',
  'password',
  'passwd',
  'passphrase',
  'secret',
  'token',
  'authorization',
  'credential',
  'privatekey',
  'private_key',
  'cookie',
  'session_id',
  'sessionid',
];

const REDACTED = '[REDACTED]';
/** Depth cap: a cyclic or pathologically nested object must not be able to hang a log call. */
const MAX_DEPTH = 6;

function isSecretKey(name: string): boolean {
  const lower = name.toLowerCase();
  return SECRET_KEYS.some((needle) => lower.includes(needle));
}

/** Walk metadata, replacing any value under a secret-looking field and pattern-scrubbing the rest. */
function redactValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return '[…]';
  if (typeof value === 'string') return Logger.redact(value);
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  // An Error in metadata JSON.stringifies to `{}`, losing the one thing worth logging. Unwrap it —
  // and scrub it, because an error message is a common place for a token to surface ("401 for
  // Bearer sk-...").
  if (value instanceof Error) return { name: value.name, message: Logger.redact(value.message) };
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = isSecretKey(k) ? REDACTED : redactValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

export class Logger {
  /** Scrub secret-SHAPED substrings out of free text. Public: callers scrub strings before storing. */
  static redact(input: string): string {
    let out = input;
    for (const re of SECRET_PATTERNS) {
      out = out.replace(re, REDACTED);
    }
    return out;
  }

  /** Scrub a metadata object on both axes (field name and value shape). Exposed for the Journal. */
  static redactMeta(meta: Record<string, unknown>): Record<string, unknown> {
    return redactValue(meta, 0) as Record<string, unknown>;
  }

  private static write(level: LogLevel, line: string): void {
    switch (level) {
      case 'debug':
        console.debug(line);
        break;
      case 'info':
        console.info(line);
        break;
      case 'warn':
        console.warn(line);
        break;
      case 'error':
      case 'fatal':
        console.error(line);
        break;
    }
  }

  private static emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const safeMessage = Logger.redact(message);
    // Serialize AFTER redacting rather than scrubbing the serialized string: a secret that contains a
    // quote or a backslash survives JSON escaping in a form no value pattern still matches, and a
    // field name is not visible to a pattern at all once it is inside one flat string.
    const safeMeta = meta === undefined ? undefined : JSON.stringify(Logger.redactMeta(meta));
    Logger.write(level, JSON.stringify({ level, message: safeMessage, meta: safeMeta }));
  }

  static debug(message: string, meta?: Record<string, unknown>): void {
    Logger.emit('debug', message, meta);
  }
  static info(message: string, meta?: Record<string, unknown>): void {
    Logger.emit('info', message, meta);
  }
  static warn(message: string, meta?: Record<string, unknown>): void {
    Logger.emit('warn', message, meta);
  }
  static error(message: string, meta?: Record<string, unknown>): void {
    Logger.emit('error', message, meta);
  }
  static fatal(message: string, meta?: Record<string, unknown>): void {
    Logger.emit('fatal', message, meta);
  }
}
