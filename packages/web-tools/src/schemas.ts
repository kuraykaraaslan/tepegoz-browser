import { z } from 'zod';
import {
  DEFAULT_WEB_FETCH_BYTES,
  DEFAULT_WEB_SEARCH_RESULTS,
  MAX_WEB_FETCH_BYTES,
  MAX_WEB_SEARCH_RESULTS,
} from './index';

export const WebSearchInputSchema = z.object({
  query: z.string().min(1).max(500),
  maxResults: z.number().int().min(1).max(MAX_WEB_SEARCH_RESULTS).default(DEFAULT_WEB_SEARCH_RESULTS),
});

export const WebFetchInputSchema = z.object({
  url: z.string().url().max(4096).refine((value) => /^https?:\/\//i.test(value), {
    message: 'Only http(s) URLs are supported',
  }),
  maxBytes: z.number().int().min(1024).max(MAX_WEB_FETCH_BYTES).default(DEFAULT_WEB_FETCH_BYTES),
});
