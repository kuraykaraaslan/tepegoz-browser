import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { WebToolsHost } from './index';
import { registerWebTools } from './web-tools';

const host: WebToolsHost = {
  search: () =>
    Promise.resolve([
      {
        title: 'Example',
        url: 'https://example.com',
        snippet: 'An example result.',
        source: 'provider',
      },
    ]),
  fetch: () =>
    Promise.resolve({
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      status: 200,
      title: 'Example',
      mimeType: 'text/html',
      text: 'Example Domain',
      truncated: false,
    }),
};

describe('registerWebTools', () => {
  it('registers web search/fetch as read tools returning normalized success envelopes', async () => {
    CapabilityRegistry.reset();
    registerWebTools({ host });

    const search = CapabilityRegistry.get('web_search_items');
    const fetch = CapabilityRegistry.get('web_get_page');
    expect(search?.descriptor.dangerClass).toBe('read');
    expect(fetch?.descriptor.category).toBe('web');

    const result = await search!.handler({ query: 'example', maxResults: 1 });
    expect(result).toMatchObject({ ok: true, summary: 'Found 1 web result(s) for "example".' });
  });

  it('rejects non-http fetch URLs at the schema boundary', () => {
    CapabilityRegistry.reset();
    registerWebTools({ host });
    expect(
      CapabilityRegistry.get('web_get_page')?.inputSchema.safeParse({
        url: 'file:///secret.txt',
        maxBytes: 1024,
      }).success,
    ).toBe(false);
  });

  it('rejects a private / loopback / metadata fetch URL at the schema boundary (SSRF guard)', () => {
    CapabilityRegistry.reset();
    registerWebTools({ host });
    const schema = CapabilityRegistry.get('web_get_page')!.inputSchema;
    for (const url of [
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost:8080/admin',
      'http://127.0.0.1/',
      'http://10.1.2.3/',
      'http://192.168.0.1/',
      'http://[::1]/',
    ]) {
      expect(schema.safeParse({ url, maxBytes: 1024 }).success, url).toBe(false);
    }
    expect(schema.safeParse({ url: 'https://example.com/', maxBytes: 1024 }).success).toBe(true);
  });
});
