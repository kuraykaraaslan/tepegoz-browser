import { describe, expect, it } from 'vitest';
import { chooseEncoding, extensionFor, SCREENSHOT_FORMATS, WEBP_QUALITY } from './user-capture';

/**
 * The encoding decision. Small, and worth its own tests because both branches are easy to get subtly
 * wrong in a way nobody notices: one stores a bigger file to honour a format preference, the other
 * lets the stored `format` field claim something the bytes are not.
 */
describe('chooseEncoding', () => {
  it('prefers WebP when it is actually smaller', () => {
    expect(chooseEncoding({ byteLength: 1_000_000 }, { byteLength: 200_000 })).toBe('image/webp');
  });

  it('keeps the PNG when WebP came out BIGGER', () => {
    // Not paranoia: WebP's lossy encoder can exceed PNG on small flat images — a screenshot of a
    // mostly-white dialog is the common case — and storing the larger file to honour a format
    // preference would defeat the only reason the preference exists.
    expect(chooseEncoding({ byteLength: 5_000 }, { byteLength: 9_000 })).toBe('image/png');
  });

  it('keeps the PNG on a tie, so an equal-size re-encode is not gratuitous churn', () => {
    expect(chooseEncoding({ byteLength: 4_096 }, { byteLength: 4_096 })).toBe('image/png');
  });

  it('falls back to PNG when there is no WebP at all', () => {
    // The renderer round trip can time out, be refused, or come back as the wrong type. A screenshot
    // that could not be shrunk is still a screenshot.
    expect(chooseEncoding({ byteLength: 1_000_000 }, null)).toBe('image/png');
  });
});

describe('the formats themselves', () => {
  it('never offers JPEG', () => {
    // A screenshot is flat colour, text and UI edges — exactly what JPEG is worst at, and the
    // artefacts land on the text people took the screenshot to keep.
    expect(SCREENSHOT_FORMATS).not.toContain('image/jpeg');
    expect(SCREENSHOT_FORMATS).toEqual(['image/webp', 'image/png']);
  });

  it('maps each format to the extension a saved copy would carry', () => {
    expect(extensionFor('image/webp')).toBe('webp');
    expect(extensionFor('image/png')).toBe('png');
  });

  it('encodes at a quality that keeps text edges readable', () => {
    // Stated as a bound rather than pinned to the exact number: the point is that it is high, and a
    // future tune within that range should not have to edit a test.
    expect(WEBP_QUALITY).toBeGreaterThanOrEqual(0.8);
    expect(WEBP_QUALITY).toBeLessThan(1);
  });
});
