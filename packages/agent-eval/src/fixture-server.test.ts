import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFixtureServer, fixtureUrl, type FixtureServer } from './fixture-server';

let root: string;
let server: FixtureServer;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agent-eval-fx-'));
  mkdirSync(join(root, 'blog-behind-nav'));
  writeFileSync(join(root, 'blog-behind-nav', 'index.html'), '<!doctype html><title>Landing</title><h1>Home</h1>');
});
afterEach(async () => {
  await server.close();
  rmSync(root, { recursive: true, force: true });
});

describe('startFixtureServer', () => {
  it('serves a fixture directory index.html over loopback', async () => {
    server = await startFixtureServer(root);
    const res = await fetch(fixtureUrl(server.url, 'blog-behind-nav'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<h1>Home</h1>');
  });

  it('404s an unknown path', async () => {
    server = await startFixtureServer(root);
    expect((await fetch(`${server.url}/nope/`)).status).toBe(404);
  });

  it('refuses path traversal outside the fixture root', async () => {
    server = await startFixtureServer(root);
    const res = await fetch(`${server.url}/../../etc/passwd`, { redirect: 'manual' });
    expect([403, 404]).toContain(res.status);
  });
});
