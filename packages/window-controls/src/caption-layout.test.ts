import { describe, expect, it } from 'vitest';
import { captionLayout } from './caption-layout';

describe('caption controls follow the platform, not one hardcoded choice', () => {
  it('lets macOS draw its own, on the left', () => {
    // `frame: false` on macOS removes the traffic lights, so the app used to ship a Mac window with
    // Windows-style buttons on the wrong side and no native ones at all.
    const mac = captionLayout('darwin');
    expect(mac.showControls).toBe(false);
    expect(mac.leadingInset).toBeGreaterThan(0);
  });

  it('draws its own on Windows and Linux, with nothing reserved on the left', () => {
    for (const platform of ['win32', 'linux', 'freebsd']) {
      const layout = captionLayout(platform);
      expect(layout.showControls, platform).toBe(true);
      expect(layout.leadingInset, platform).toBe(0);
    }
  });

  it('treats an unknown platform like Windows rather than leaving no controls at all', () => {
    // Failing toward "the user can still close the window" is the only safe direction here.
    expect(captionLayout('').showControls).toBe(true);
  });
});
