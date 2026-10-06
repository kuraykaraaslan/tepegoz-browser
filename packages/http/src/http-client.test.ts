import { afterEach, describe, it, expect } from 'vitest';
import { Agent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { AppError } from '@tepegoz/libs';
import { DEFAULT_TIMEOUT_MS, createHttpClient, pinningLookup } from './http-client';
import { resetEgressForTests, setEgressPolicy, setTunnelAgentFactory } from './egress-route';

describe('createHttpClient — configuration', () => {
  it('applies a baseURL when one is given, and leaves it unset otherwise', () => {
    expect(createHttpClient({ baseURL: 'https://api.example.test' }).defaults.baseURL).toBe(
      'https://api.example.test',
    );
    expect(createHttpClient().defaults.baseURL).toBeUndefined();
  });

  it('merges caller headers over the JSON default rather than dropping them', () => {
    const client = createHttpClient({
      headers: { 'X-Trace': 'abc', 'Content-Type': 'text/plain' },
    });
    expect(client.defaults.headers['X-Trace']).toBe('abc');
    expect(client.defaults.headers['Content-Type']).toBe('text/plain');
  });

  it('uses the default timeout unless one is asked for', () => {
    expect(createHttpClient().defaults.timeout).toBe(DEFAULT_TIMEOUT_MS);
    expect(createHttpClient({ timeoutMs: 1234 }).defaults.timeout).toBe(1234);
  });
});

describe('createHttpClient — blockPrivateHosts SSRF guard', () => {
  function ok(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
    return Promise.resolve({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { ok: true },
      config,
    } as AxiosResponse);
  }

  it('refuses a private-host request before it is sent (AppError 400, adapter never called)', async () => {
    const client = createHttpClient({ blockPrivateHosts: true });
    let calls = 0;
    client.defaults.adapter = (config) => {
      calls += 1;
      return ok(config);
    };
    for (const url of [
      'http://169.254.169.254/latest/meta-data/',
      'http://127.0.0.1/',
      'http://10.1.2.3/admin',
      'http://localhost:9000/',
    ]) {
      const err = await client.get(url).catch((e: unknown) => e);
      expect(err, url).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode, url).toBe(400);
    }
    expect(calls).toBe(0);
  });

  it('re-checks every redirect hop via beforeRedirect', async () => {
    const client = createHttpClient({ blockPrivateHosts: true });
    let beforeRedirect: ((o: { href?: string }) => void) | undefined;
    client.defaults.adapter = (config) => {
      beforeRedirect = config.beforeRedirect as typeof beforeRedirect;
      return ok(config);
    };
    await client.get('https://public.example/start');
    expect(beforeRedirect).toBeTypeOf('function');
    expect(() => beforeRedirect!({ href: 'https://also-public.example/next' })).not.toThrow();
    expect(() => beforeRedirect!({ href: 'http://169.254.169.254/latest/' })).toThrow(AppError);
    expect(() => beforeRedirect!({ href: 'http://192.168.1.1/' })).toThrow(AppError);
  });

  it('wires the resolve-then-pin lookup onto every request (covers hostnames the literal check cannot)', async () => {
    const client = createHttpClient({ blockPrivateHosts: true });
    let seen: InternalAxiosRequestConfig | null = null;
    client.defaults.adapter = (config) => {
      seen = config;
      return ok(config);
    };
    await client.get('https://public.example/start');
    expect((seen as unknown as InternalAxiosRequestConfig).lookup).toBe(pinningLookup);
  });

  it('caps the redirect chain when the caller left maxRedirects unset', async () => {
    const client = createHttpClient({ blockPrivateHosts: true });
    let seen: InternalAxiosRequestConfig | null = null;
    client.defaults.adapter = (config) => {
      seen = config;
      return ok(config);
    };
    await client.get('https://public.example/start');
    expect((seen as unknown as InternalAxiosRequestConfig).maxRedirects).toBe(5);
  });

  it('respects a caller-supplied maxRedirects instead of overriding it', async () => {
    const client = createHttpClient({ blockPrivateHosts: true });
    let seen: InternalAxiosRequestConfig | null = null;
    client.defaults.adapter = (config) => {
      seen = config;
      return ok(config);
    };
    // Mirrors sitemap-reader.ts's own `maxRedirects: 0` discipline — a caller that already made a
    // choice here is not second-guessed.
    await client.get('https://public.example/start', { maxRedirects: 0 });
    expect((seen as unknown as InternalAxiosRequestConfig).maxRedirects).toBe(0);
  });

  it('is a no-op when the option is absent — a private host passes straight through', async () => {
    const client = createHttpClient();
    let seen: InternalAxiosRequestConfig | null = null;
    client.defaults.adapter = (config) => {
      seen = config;
      return ok(config);
    };
    const res = await client.get('http://127.0.0.1:9000/admin');
    expect(res.status).toBe(200);
    expect((seen as unknown as InternalAxiosRequestConfig).beforeRedirect).toBeUndefined();
    expect((seen as unknown as InternalAxiosRequestConfig).lookup).toBeUndefined();
    expect((seen as unknown as InternalAxiosRequestConfig).maxRedirects).toBeUndefined();
  });

  it('is a no-op when the option is explicitly false', async () => {
    const client = createHttpClient({ blockPrivateHosts: false });
    let calls = 0;
    client.defaults.adapter = (config) => {
      calls += 1;
      return ok(config);
    };
    const res = await client.get('http://10.0.0.1/');
    expect(res.status).toBe(200);
    expect(calls).toBe(1);
  });
});

describe('createHttpClient — the egress route is decided per request', () => {
  afterEach(() => {
    resetEgressForTests();
  });

  it('attaches nothing for the ordinary Direct case', async () => {
    // Direct has to stay byte-identical to a plain axios request: no agents, and axios still free to
    // read the environment proxy as it always did.
    const client = createHttpClient();
    let seen: InternalAxiosRequestConfig | null = null;
    client.defaults.adapter = (config) => {
      seen = config;
      return Promise.resolve({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
        config,
      } as AxiosResponse);
    };

    await client.get('http://example.test/x');
    expect(seen).not.toBeNull();
    expect((seen as unknown as InternalAxiosRequestConfig).httpsAgent).toBeUndefined();
    expect((seen as unknown as InternalAxiosRequestConfig).proxy).toBeUndefined();
  });

  it('attaches the tunnel agents and turns axios off the environment proxy', async () => {
    // One route per request, and it is ours: leaving HTTP_PROXY in play would give a tunnelled
    // request a second, unasked-for hop.
    const httpAgent = new Agent();
    const httpsAgent = new HttpsAgent();
    setTunnelAgentFactory(() => ({ httpAgent, httpsAgent }));
    setEgressPolicy(() => ({ mode: 'tunnel', socksPort: 1080 }));

    const client = createHttpClient();
    let seen: InternalAxiosRequestConfig | null = null;
    client.defaults.adapter = (config) => {
      seen = config;
      return Promise.resolve({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
        config,
      } as AxiosResponse);
    };

    await client.get('http://example.test/x');
    const cfg = seen as unknown as InternalAxiosRequestConfig;
    expect(cfg.httpAgent).toBe(httpAgent);
    expect(cfg.httpsAgent).toBe(httpsAgent);
    expect(cfg.proxy).toBe(false);
  });

  it('decides the route at REQUEST time, not when the client was built', async () => {
    // A long-lived client (an LLM provider) outlives a change to the General binding; deciding at
    // construction would keep sending down a route the user has since turned off.
    const client = createHttpClient();
    const seen: unknown[] = [];
    client.defaults.adapter = (config) => {
      seen.push(config.httpsAgent);
      return Promise.resolve({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
        config,
      } as AxiosResponse);
    };

    await client.get('http://example.test/one');

    const httpsAgent = new HttpsAgent();
    setTunnelAgentFactory(() => ({ httpAgent: new Agent(), httpsAgent }));
    setEgressPolicy(() => ({ mode: 'tunnel', socksPort: 1080 }));
    await client.get('http://example.test/two');

    expect(seen[0]).toBeUndefined();
    expect(seen[1]).toBe(httpsAgent);
  });
});
