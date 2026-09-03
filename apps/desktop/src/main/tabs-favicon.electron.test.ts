import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

interface FakeResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: Buffer[];
}

const h = vi.hoisted(() => ({
  next: { value: null as null | { statusCode: number; type: string | null; body: Buffer[] } },
  calls: [] as { url: string; session: unknown }[],
  request: vi.fn(),
}));

vi.mock('electron', () => ({ net: { request: h.request } }));

const { faviconDataUrl, clearFaviconCacheForTests } = await import('./tabs-favicon.electron');

/** A `net.request` stand-in that replays whatever `h.next` describes, or errors when it is null. */
function installFakeNet(): void {
  h.request.mockImplementation((opts: { url: string; session: unknown }) => {
    h.calls.push({ url: opts.url, session: opts.session });
    const request = new EventEmitter() as EventEmitter & {
      end: () => void;
      abort: () => void;
    };
    request.abort = vi.fn();
    request.end = () => {
      queueMicrotask(() => {
        const spec = h.next.value;
        if (spec === null) {
          request.emit('error', new Error('offline'));
          return;
        }
        const response = new EventEmitter() as EventEmitter & FakeResponse;
        response.statusCode = spec.statusCode;
        response.headers = spec.type === null ? {} : { 'Content-Type': spec.type };
        request.emit('response', response);
        queueMicrotask(() => {
          for (const chunk of spec.body) response.emit('data', chunk);
          response.emit('end');
        });
      });
    };
    return request;
  });
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const ok = (type: string | null = 'image/png', body = [PNG]) => ({ statusCode: 200, type, body });

const session = (name: string): Electron.Session => ({ name }) as unknown as Electron.Session;

beforeEach(() => {
  h.calls.length = 0;
  h.next.value = ok();
  h.request.mockReset();
  installFakeNet();
});

describe('fetching a favicon', () => {
  it('returns an inline data: URL, so the chrome never touches the network for it', async () => {
    const result = await faviconDataUrl(session('a'), 'https://site.test/favicon.png');
    expect(result).toBe(`data:image/png;base64,${PNG.toString('base64')}`);
  });

  it('THE POINT: the request is made on the PAGE’S session, not the app chrome’s', async () => {
    const tunnel = session('tunnel');
    await faviconDataUrl(tunnel, 'https://site.test/favicon.png');
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]?.session).toBe(tunnel);
  });

  it('passes an inline data:image through without a request at all', async () => {
    const inline = 'data:image/gif;base64,R0lGOD';
    expect(await faviconDataUrl(session('a'), inline)).toBe(inline);
    expect(h.calls).toHaveLength(0);
  });

  it('refuses a non-http(s) scheme and anything unparsable', async () => {
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'not a url', '']) {
      expect(await faviconDataUrl(session('a'), url)).toBeNull();
    }
    expect(h.calls).toHaveLength(0);
  });
});

describe('bounds on page-controlled input', () => {
  it('refuses a non-image content-type — a 404 HTML page served as an icon is not an icon', async () => {
    h.next.value = ok('text/html');
    expect(await faviconDataUrl(session('a'), 'https://site.test/favicon.png')).toBeNull();
  });

  it('refuses a missing content-type', async () => {
    h.next.value = ok(null);
    expect(await faviconDataUrl(session('a'), 'https://site.test/favicon.png')).toBeNull();
  });

  it('refuses a non-200 response', async () => {
    h.next.value = { statusCode: 404, type: 'image/png', body: [PNG] };
    expect(await faviconDataUrl(session('a'), 'https://site.test/favicon.png')).toBeNull();
  });

  it('refuses an oversized icon rather than truncating it', async () => {
    h.next.value = ok('image/png', [Buffer.alloc(70 * 1024)]);
    expect(await faviconDataUrl(session('a'), 'https://site.test/favicon.png')).toBeNull();
  });

  it('answers null on a network error instead of throwing on a page-controlled event', async () => {
    h.next.value = null;
    await expect(faviconDataUrl(session('a'), 'https://site.test/favicon.png')).resolves.toBeNull();
  });
});

describe('caching', () => {
  it('does not re-fetch the same icon, and caches the FAILURE too', async () => {
    const ses = session('a');
    h.next.value = ok('text/html'); // fails
    expect(await faviconDataUrl(ses, 'https://site.test/x.png')).toBeNull();
    expect(await faviconDataUrl(ses, 'https://site.test/x.png')).toBeNull();
    // Without caching the null, a site with a broken icon re-fetches on every single navigation.
    expect(h.calls).toHaveLength(1);
  });

  it('keeps caches per session — a shared one would be a cross-partition oracle', async () => {
    const direct = session('direct');
    const tunnel = session('tunnel');
    await faviconDataUrl(direct, 'https://site.test/x.png');
    await faviconDataUrl(tunnel, 'https://site.test/x.png');
    expect(h.calls.map((c) => c.session)).toEqual([direct, tunnel]);
    clearFaviconCacheForTests(direct);
    clearFaviconCacheForTests(tunnel);
  });

  it('evicts the oldest entry once 256 icons are cached for a session', async () => {
    const ses = session('cap');
    for (let i = 0; i < 256; i += 1) {
      await faviconDataUrl(ses, `https://site.test/i${String(i)}.png`);
    }
    expect(h.calls).toHaveLength(256);

    await faviconDataUrl(ses, 'https://site.test/overflow.png'); // 257th → evicts i0
    await faviconDataUrl(ses, 'https://site.test/i0.png'); // i0 no longer cached → re-fetch
    expect(h.calls).toHaveLength(258);

    clearFaviconCacheForTests(ses);
  });
});

describe('transport failure modes', () => {
  it('answers null when net.request cannot be created at all', async () => {
    h.request.mockImplementationOnce(() => {
      throw new Error('net unavailable');
    });
    expect(await faviconDataUrl(session('a'), 'https://site.test/f.png')).toBeNull();
  });

  it('aborts and answers null when the request never responds', async () => {
    vi.useFakeTimers();
    try {
      const abort = vi.fn();
      h.request.mockImplementationOnce((opts: { url: string; session: unknown }) => {
        h.calls.push({ url: opts.url, session: opts.session });
        const req = new EventEmitter() as EventEmitter & { end: () => void; abort: () => void };
        req.abort = abort;
        req.end = () => undefined; // never emits response or error
        return req;
      });
      const p = faviconDataUrl(session('a'), 'https://site.test/slow.png');
      await vi.advanceTimersByTimeAsync(10_000); // past TIMEOUT_MS (8s)
      await expect(p).resolves.toBeNull();
      expect(abort).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
