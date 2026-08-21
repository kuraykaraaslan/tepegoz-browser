import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { registerScreenshotTools, type ScreenshotToolsHost } from './screenshot-tools';

describe('screenshot tools', () => {
  it('registers browser_get_screenshot as a read browser tool', async () => {
    CapabilityRegistry.reset();
    const host: ScreenshotToolsHost = {
      captureScreenshot: (input) =>
        Promise.resolve({
          url: 'https://example.com',
          title: 'Example',
          mode: input.mode ?? 'viewport',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,AA==',
          width: 1,
          height: 1,
          pageWidth: 1,
          pageHeight: 1,
          byteLength: 1,
          capturedAt: 1,
        }),
    };

    registerScreenshotTools({ host });

    const tool = CapabilityRegistry.get('browser_get_screenshot');
    expect(tool?.descriptor.dangerClass).toBe('read');
    expect(tool?.descriptor.category).toBe('browser');
    const result = await tool!.handler({ mode: 'fullPage' });
    expect(result).toMatchObject({ mode: 'fullPage', mimeType: 'image/png' });
  });
});
