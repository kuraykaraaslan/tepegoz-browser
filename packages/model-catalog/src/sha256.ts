import { createHash } from 'node:crypto';

/** Streaming sha256 over an async byte stream (e.g. a finished file read stream). Lowercase hex. */
export async function sha256OfStream(chunks: AsyncIterable<Uint8Array>): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of chunks) hash.update(chunk);
  return hash.digest('hex');
}

/** sha256 of an in-memory buffer. Lowercase hex. */
export function sha256OfBuffer(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Case-insensitive hex-digest comparison (both are 64-char lowercase hex in practice). */
export function digestsMatch(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
