import { describe, expect, it } from 'vitest';
import {
  CHROMIUM_FLAG_ALLOWLIST,
  CHROMIUM_FLAG_IDS,
  ChromiumFlagOverridesSchema,
  chromiumFlagDef,
  enabledChromiumFlagIds,
  type ChromiumFlagApply,
} from './chromium-flags';

/** The command-line target of an apply spec, whatever its kind — for allowlist-content assertions. */
function applyTarget(apply: ChromiumFlagApply): string {
  switch (apply.kind) {
    case 'switch':
    case 'switch-value':
      return apply.switch;
    case 'enable-feature':
    case 'disable-feature':
      return apply.feature;
  }
}

describe('chromium flag allowlist', () => {
  it('has unique, non-empty, url-safe-ish ids', () => {
    const ids = CHROMIUM_FLAG_ALLOWLIST.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('never allowlists a flag that weakens the renderer boundary or opens a debug port', () => {
    // The whole point of the allowlist (ADR-0041): these can never appear, by any id.
    const banned = [
      'disable-web-security',
      'no-sandbox',
      'disable-site-isolation-trials',
      'remote-debugging-port',
      'remote-debugging-pipe',
      'allow-running-insecure-content',
      'disable-webgl-image-chromium',
      'unsafely-treat-insecure-origin-as-secure',
    ];
    for (const f of CHROMIUM_FLAG_ALLOWLIST) {
      expect(banned).not.toContain(applyTarget(f.apply));
    }
  });

  it('CHROMIUM_FLAG_IDS mirrors the allowlist order', () => {
    expect([...CHROMIUM_FLAG_IDS]).toEqual(CHROMIUM_FLAG_ALLOWLIST.map((f) => f.id));
  });

  it('chromiumFlagDef resolves a known id and throws on an unknown one', () => {
    expect(chromiumFlagDef('force-dark-mode').apply).toEqual({
      kind: 'switch',
      switch: 'force-dark-mode',
    });
    // @ts-expect-error — exercising the runtime guard with a bad id
    expect(() => chromiumFlagDef('nope')).toThrow(/unknown chromium flag/);
  });
});

describe('ChromiumFlagOverridesSchema', () => {
  it('accepts an empty object and a subset of known ids', () => {
    expect(ChromiumFlagOverridesSchema.parse({})).toEqual({});
    expect(ChromiumFlagOverridesSchema.parse({ 'force-dark-mode': true, 'disable-gpu': false })).toEqual(
      { 'force-dark-mode': true, 'disable-gpu': false },
    );
  });

  it('rejects an unknown key — a hand-edited preferences.json cannot smuggle a flag', () => {
    expect(ChromiumFlagOverridesSchema.safeParse({ 'no-sandbox': true }).success).toBe(false);
  });

  it('rejects a non-boolean value', () => {
    expect(ChromiumFlagOverridesSchema.safeParse({ 'force-dark-mode': 'yes' }).success).toBe(false);
  });
});

describe('enabledChromiumFlagIds', () => {
  it('returns only the on flags, in allowlist order', () => {
    expect(
      enabledChromiumFlagIds({ 'disable-gpu': true, 'force-dark-mode': true, 'show-fps-counter': false }),
    ).toEqual(['force-dark-mode', 'disable-gpu']);
  });
});
