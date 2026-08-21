import { describe, it, expect } from 'vitest';
import { loadCatalog } from './load-catalog';
import {
  EMPTY_INSTALL_STATE,
  findInstall,
  loadInstallState,
  removeInstall,
  upsertInstall,
  type ModelInstall,
} from './install-state';
import { digestsMatch, sha256OfBuffer, sha256OfStream } from './sha256';
import { downloadStream } from './downloader';

const GOOD = {
  id: 'tepegoz-slm-1',
  name: 'Tepegöz SLM 1',
  url: 'https://example.com/model.gguf',
  sizeBytes: 1024,
  sha256: 'a'.repeat(64),
  quant: 'Q4_K_M',
  ctx: 4096,
  paramsB: 1.5,
  recommended: true,
  firstParty: true,
  license: 'llama3.2',
};

describe('loadCatalog', () => {
  it('loads valid entries and defaults recommended/firstParty', () => {
    const { entries, errors } = loadCatalog({
      version: 1,
      models: [
        GOOD,
        { ...GOOD, id: 'other', name: 'Other', recommended: undefined, firstParty: undefined },
      ],
    });
    expect(errors).toEqual([]);
    expect(entries.map((e) => e.id)).toEqual(['tepegoz-slm-1', 'other']);
    expect(entries[1]?.recommended).toBe(false);
  });

  it('drops a malformed entry and a duplicate id, keeping the rest', () => {
    const { entries, errors } = loadCatalog({
      version: 1,
      models: [GOOD, { id: 'bad' }, { ...GOOD }],
    });
    expect(entries.map((e) => e.id)).toEqual(['tepegoz-slm-1']);
    expect(errors).toHaveLength(2);
  });

  it('rejects a bad envelope with one error and no entries', () => {
    expect(loadCatalog({ version: 2, models: [] }).errors).toHaveLength(1);
    expect(loadCatalog('nope').entries).toEqual([]);
  });
});

describe('install-state', () => {
  const rec: ModelInstall = {
    id: 'm',
    status: 'installed',
    bytesDownloaded: 10,
    sizeBytes: 10,
    sha256Verified: true,
    filePath: '/models/m/model.gguf',
  };

  it('upserts, finds, and removes records immutably', () => {
    const s1 = upsertInstall(EMPTY_INSTALL_STATE, rec);
    expect(findInstall(s1, 'm')?.status).toBe('installed');
    const s2 = upsertInstall(s1, { ...rec, status: 'error', error: 'x' });
    expect(s2.models).toHaveLength(1);
    expect(findInstall(s2, 'm')?.status).toBe('error');
    expect(removeInstall(s2, 'm').models).toEqual([]);
    expect(EMPTY_INSTALL_STATE.models).toEqual([]); // unchanged
  });

  it('leniently salvages good records and drops malformed ones', () => {
    const state = loadInstallState({ version: 1, models: [rec, { id: 'broken' }] });
    expect(state.models.map((m) => m.id)).toEqual(['m']);
    expect(loadInstallState('garbage')).toEqual(EMPTY_INSTALL_STATE);
  });
});

describe('sha256', () => {
  it('hashes a buffer and matches a streamed digest', async () => {
    const bytes = new TextEncoder().encode('tepegoz');
    const bufDigest = sha256OfBuffer(bytes);
    // eslint-disable-next-line @typescript-eslint/require-await -- async generator yields only, no await needed
    async function* chunks(): AsyncGenerator<Uint8Array> {
      yield bytes.subarray(0, 3);
      yield bytes.subarray(3);
    }
    const streamDigest = await sha256OfStream(chunks());
    expect(digestsMatch(bufDigest, streamDigest)).toBe(true);
    expect(bufDigest).toMatch(/^[a-f0-9]{64}$/);
  });
});

/** A minimal async byte stream from fixed chunks (manual iterator → no `require-await` violation). */
function fakeStream(parts: Uint8Array[]): AsyncIterable<Uint8Array> {
  const it = parts[Symbol.iterator]();
  return {
    [Symbol.asyncIterator]: () => ({
      next: () => {
        const r = it.next();
        return Promise.resolve(
          r.done === true ? { value: undefined, done: true } : { value: r.value, done: false },
        );
      },
    }),
  };
}

describe('downloadStream', () => {
  it('streams to the sink, resumes from existingBytes, and reports progress', async () => {
    const written: number[] = [];
    const progress: number[] = [];
    const total = await downloadStream('https://x/m.gguf', {
      open: (_url, fromByte) => {
        expect(fromByte).toBe(4); // resume point passed through as the Range start
        return Promise.resolve(fakeStream([new Uint8Array([1, 2]), new Uint8Array([3])]));
      },
      append: (chunk) => {
        written.push(chunk.length);
        return Promise.resolve();
      },
      existingBytes: 4,
      onProgress: (b) => progress.push(b),
    });
    expect(written).toEqual([2, 1]);
    expect(progress).toEqual([6, 7]); // 4 existing + 2, then +1
    expect(total).toBe(7);
  });

  it('throws when canceled mid-stream', async () => {
    const signal = { aborted: false };
    await expect(
      downloadStream('https://x/m.gguf', {
        open: () => Promise.resolve(fakeStream([new Uint8Array([1]), new Uint8Array([2])])),
        append: () => {
          signal.aborted = true; // cancel after the first chunk
          return Promise.resolve();
        },
        existingBytes: 0,
        signal,
      }),
    ).rejects.toThrow(/canceled/i);
  });
});
