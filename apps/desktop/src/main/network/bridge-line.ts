/**
 * Tor bridge-line sanitizing and shape validation (Phase 5).
 *
 * Pure \u2014 no Electron, no filesystem. A bridge line is copied out of a web page or a mail, so it arrives
 * with Unicode spaces, soft hyphens, zero-width characters, smart quotes and stray line breaks. A
 * malformed line breaks the censorship-circumvention chain at the moment the user needs it, with an error
 * that reads like "Tor is broken" \u2014 so the line is normalized first and validated for SHAPE second.
 *
 * Validation is shape-only on purpose: whether a bridge is reachable is the connection test's job.
 */

export class BridgeLineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BridgeLineError';
  }
}

export interface BridgeLine {
  /** Pluggable transport name, or `null` for a plain (vanilla) bridge. */
  transport: string | null;
  /** `host:port` / `[v6]:port`, or a URL-less `addr:port` token as given. */
  address: string;
  /** 40-hex relay fingerprint, upper-cased; `null` when the line carries none. */
  fingerprint: string | null;
  /** `key=value` arguments in line order (`cert=\u2026`, `iat-mode=0`, `url=\u2026`). */
  args: [string, string][];
  /** The canonical single-line form, ready for a `Bridge` torrc entry (no `Bridge ` prefix). */
  line: string;
}

const TRANSPORTS = new Set(['obfs4', 'meek_lite', 'snowflake', 'webtunnel', 'scramblesuit']);
const FINGERPRINT_RE = /^[0-9A-Fa-f]{40}$/;
const ADDRESS_RE = /^(\[[0-9a-fA-F:]+\]|[^\s:[\]]+):(\d{1,5})$/;
const ARG_RE = /^([A-Za-z0-9_-]+)=(\S+)$/;

/** Zero-width, bidi-control, soft-hyphen and BOM characters that survive a copy-paste unseen. */
const INVISIBLE_RE =
  // eslint-disable-next-line no-misleading-character-class
  /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;
const QUOTES_RE = /[\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F"'`]/g;

/** Collapse a pasted bridge line to one clean, single-spaced line. */
export function normalizeBridgeLine(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(INVISIBLE_RE, '')
    .replace(QUOTES_RE, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^bridge /i, '');
}

/**
 * Normalize, then validate the shape of, one pasted bridge line.
 * @throws BridgeLineError with a message that says what to fix.
 */
export function parseBridgeLine(raw: string): BridgeLine {
  const cleaned = normalizeBridgeLine(raw);
  if (cleaned === '') throw new BridgeLineError('The bridge line is empty.');
  if (/[\r\n]/.test(raw.trim())) {
    const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length > 1) {
      throw new BridgeLineError('Paste one bridge per entry; found several lines.');
    }
  }

  const tokens = cleaned.split(' ');
  let transport: string | null = null;
  if (!ADDRESS_RE.test(tokens[0] ?? '') && ADDRESS_RE.test(tokens[1] ?? '')) {
    transport = (tokens.shift() ?? '').toLowerCase();
    if (!TRANSPORTS.has(transport)) {
      throw new BridgeLineError(
        `Unknown transport "${transport}". Supported: ${[...TRANSPORTS].join(', ')}.`,
      );
    }
  }

  const address = tokens.shift() ?? '';
  const m = ADDRESS_RE.exec(address);
  if (!m) throw new BridgeLineError('Expected an address in host:port form.');
  const port = Number(m[2]);
  if (port < 1 || port > 65535) throw new BridgeLineError(`Port ${port} is out of range.`);

  let fingerprint: string | null = null;
  if (tokens[0] !== undefined && !tokens[0].includes('=')) {
    const fp = tokens.shift() as string;
    if (!FINGERPRINT_RE.test(fp)) {
      throw new BridgeLineError('The fingerprint must be 40 hexadecimal characters.');
    }
    fingerprint = fp.toUpperCase();
  }

  const args: [string, string][] = [];
  for (const t of tokens) {
    const a = ARG_RE.exec(t);
    if (!a) throw new BridgeLineError(`Unrecognized token "${t}"; expected key=value.`);
    args.push([a[1] as string, a[2] as string]);
  }

  if (transport === null && fingerprint === null && args.length > 0) {
    throw new BridgeLineError('A plain bridge cannot carry key=value arguments.');
  }
  if (transport === 'obfs4' && !args.some(([k]) => k === 'cert')) {
    throw new BridgeLineError('An obfs4 bridge needs a cert=\u2026 argument.');
  }

  const line = [transport, address, fingerprint, ...args.map(([k, v]) => `${k}=${v}`)]
    .filter((p): p is string => p !== null)
    .join(' ');
  return { transport, address, fingerprint, args, line };
}
