export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Secret/PII redaction patterns. The Event Journal and the Live Agent Console both route through
 * Logger.redact (plan §13.9): API keys, bearer tokens, and JWT-like strings never hit logs/Journal.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{16,}/g, // Anthropic
  /sk-[A-Za-z0-9]{20,}/g, // OpenAI-style
  /AIza[A-Za-z0-9_-]{20,}/g, // Google API key
  /Bearer\s+[A-Za-z0-9._-]{16,}/g, // bearer tokens
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
];

export class Logger {
  static redact(input: string): string {
    let out = input;
    for (const re of SECRET_PATTERNS) {
      out = out.replace(re, '[REDACTED]');
    }
    return out;
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
    const safeMeta = meta === undefined ? undefined : Logger.redact(JSON.stringify(meta));
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
