import { describe, expect, it } from 'vitest';
import { KEEP_RENDERING_SWITCHES } from './chromium-switches';
import { mergeChromiumSwitches, resolveChromiumFlagSwitches } from './chromium-flags-apply';

describe('mergeChromiumSwitches', () => {
  it('collapses enable-features / disable-features to one entry each, values joined + dedup', () => {
    const merged = mergeChromiumSwitches(
      [{ name: 'disable-features', value: 'CalculateNativeWinOcclusion' }],
      [{ name: 'enable-features', value: 'ParallelDownloading' }],
      [{ name: 'enable-features', value: 'OverlayScrollbars,ParallelDownloading' }],
    );
    expect(merged).toContainEqual({
      name: 'disable-features',
      value: 'CalculateNativeWinOcclusion',
    });
    expect(merged).toContainEqual({
      name: 'enable-features',
      value: 'ParallelDownloading,OverlayScrollbars',
    });
    expect(merged.filter((s) => s.name === 'enable-features')).toHaveLength(1);
  });

  it('passes bare + valued switches through in order, dropping exact duplicates', () => {
    const merged = mergeChromiumSwitches(
      [{ name: 'disable-renderer-backgrounding' }, { name: 'force-dark-mode' }],
      [{ name: 'force-dark-mode' }, { name: 'disable-gpu' }],
    );
    expect(merged).toEqual([
      { name: 'disable-renderer-backgrounding' },
      { name: 'force-dark-mode' },
      { name: 'disable-gpu' },
    ]);
  });
});

describe('resolveChromiumFlagSwitches', () => {
  it('is empty when nothing is enabled', () => {
    expect(resolveChromiumFlagSwitches({})).toEqual([]);
    expect(resolveChromiumFlagSwitches({ 'force-dark-mode': false })).toEqual([]);
  });

  it('maps a boolean switch flag', () => {
    expect(resolveChromiumFlagSwitches({ 'force-dark-mode': true })).toEqual([
      { name: 'force-dark-mode' },
    ]);
  });

  it('maps feature flags into a single enable-features switch', () => {
    expect(
      resolveChromiumFlagSwitches({ 'parallel-downloading': true, 'overlay-scrollbars': true }),
    ).toEqual([{ name: 'enable-features', value: 'ParallelDownloading,OverlayScrollbars' }]);
  });

  it('merges cleanly with the app baseline without clobbering disable-features', () => {
    const merged = mergeChromiumSwitches(
      KEEP_RENDERING_SWITCHES,
      resolveChromiumFlagSwitches({ 'parallel-downloading': true }),
    );
    expect(merged).toContainEqual({
      name: 'disable-features',
      value: 'CalculateNativeWinOcclusion',
    });
    expect(merged).toContainEqual({ name: 'enable-features', value: 'ParallelDownloading' });
  });
});
