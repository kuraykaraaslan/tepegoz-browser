import { describe, expect, it } from 'vitest';
import { READER_EXTRACTOR_SOURCE } from './reader-bundle';

/**
 * `reader-bundle` — the auto-generated reader-extractor IIFE evaluated inside a browsed page. Pinned:
 * it is a non-empty self-contained script that ends in the `extractFromPage()` call the injector
 * relies on for a return value.
 */
describe('READER_EXTRACTOR_SOURCE', () => {
  it('is a non-empty self-invoking bundle that returns the extraction result', () => {
    expect(typeof READER_EXTRACTOR_SOURCE).toBe('string');
    expect(READER_EXTRACTOR_SOURCE.length).toBeGreaterThan(1000);
    expect(READER_EXTRACTOR_SOURCE).toContain('__tepegozReader');
    expect(READER_EXTRACTOR_SOURCE).toContain('extractFromPage()');
  });
});
