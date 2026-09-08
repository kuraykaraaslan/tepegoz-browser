import { z } from 'zod';
import {
  DEFAULT_WEB_FETCH_BYTES,
  DEFAULT_WEB_SEARCH_RESULTS,
  MAX_WEB_FETCH_BYTES,
  MAX_WEB_SEARCH_RESULTS,
} from './index';
import { isPublicHttpUrl } from '@tepegoz/http';

export const WebSearchInputSchema = z.object({
  query: z.string().min(1).max(500),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(MAX_WEB_SEARCH_RESULTS)
    .default(DEFAULT_WEB_SEARCH_RESULTS),
});

export const WebFetchInputSchema = z.object({
  url: z
    .string()
    .url()
    .max(4096)
    .refine((value) => /^https?:\/\//i.test(value), {
      message: 'Only http(s) URLs are supported',
    })
    // SSRF guard: the agent picks this URL, so a loopback / private / link-local / cloud-metadata
    // host is refused at the tool boundary before the fetch is ever dispatched (see ssrf-guard.ts).
    .refine(isPublicHttpUrl, {
      message: 'URL must be a publicly routable http(s) address',
    }),
  maxBytes: z.number().int().min(1024).max(MAX_WEB_FETCH_BYTES).default(DEFAULT_WEB_FETCH_BYTES),
});
