import { afterEach, describe, it, expect, vi } from 'vitest';
import dns from 'node:dns';
import { BLOCKED_HOST_CODE, pinningLookup } from './http-client';
import { HttpMessages } from './messages';

describe('pinningLookup — resolve-then-pin DNS-rebinding guard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes through a public resolved address', async () => {
    vi.spyOn(dns, 'lookup').mockImplementation(((_hostname, _opts, cb) => {
      (cb as (err: null, address: string, family: number) => void)(null, '93.184.216.34', 4);
    }) as typeof dns.lookup);

    const result = await new Promise<[Error | null, string, number]>((resolve) => {
      pinningLookup('public.example', {}, (err, address, family) =>
        resolve([err, address, family]),
      );
    });
    expect(result).toEqual([null, '93.184.216.34', 4]);
  });

  it('blocks a hostname that resolves to a private address (DNS rebinding)', async () => {
    vi.spyOn(dns, 'lookup').mockImplementation(((_hostname, _opts, cb) => {
      (cb as (err: null, address: string, family: number) => void)(null, '169.254.169.254', 4);
    }) as typeof dns.lookup);

    const [err] = await new Promise<[NodeJS.ErrnoException | null, string, number]>((resolve) => {
      pinningLookup('rebinds-to-metadata.example', {}, (e, address, family) =>
        resolve([e, address, family]),
      );
    });
    expect(err?.code).toBe(BLOCKED_HOST_CODE);
    expect(err?.message).toBe(HttpMessages.BlockedNonPublicHost);
  });

  it('forces a single-address callback shape (all: false) regardless of the caller-supplied options', async () => {
    const seenOpts: unknown[] = [];
    vi.spyOn(dns, 'lookup').mockImplementation(((_hostname, opts, cb) => {
      seenOpts.push(opts);
      (cb as (err: null, address: string, family: number) => void)(null, '93.184.216.34', 4);
    }) as typeof dns.lookup);

    await new Promise<void>((resolve) => {
      pinningLookup('public.example', { all: true } as unknown as dns.LookupOneOptions, () =>
        resolve(),
      );
    });
    expect(seenOpts[0]).toMatchObject({ all: false });

    // A numeric `options` (bare address family) is normalized into the object shape too.
    await new Promise<void>((resolve) => {
      pinningLookup('public.example', 4, () => resolve());
    });
    expect(seenOpts[1]).toMatchObject({ family: 4, all: false });
  });

  it('passes a DNS resolution failure straight through', async () => {
    const notFound = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    vi.spyOn(dns, 'lookup').mockImplementation(((_hostname, _opts, cb) => {
      (cb as (err: Error) => void)(notFound);
    }) as typeof dns.lookup);

    const [err] = await new Promise<[NodeJS.ErrnoException | null]>((resolve) => {
      pinningLookup('nowhere.example', {}, (e) => resolve([e]));
    });
    expect(err).toBe(notFound);
  });
});
