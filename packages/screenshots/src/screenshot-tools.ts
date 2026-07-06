import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { ToolDescriptor } from '@tepegoz/shared-types';
import type { ScreenshotCaptureInput, ScreenshotCaptureResult } from './index';
import { buildScreenshotSnapshot } from './index';
import { ScreenshotCaptureInputSchema } from './schemas';

export interface ScreenshotToolsHost {
  captureScreenshot(input: ScreenshotCaptureInput): Promise<ScreenshotCaptureResult>;
}

function descriptor(): ToolDescriptor {
  return {
    id: 'browser_get_screenshot',
    description:
      'Capture a bounded browser screenshot for visual fallback when page text/a11y is insufficient. ' +
      'Args: { tabId?, mode?: "viewport"|"fullPage", maxEdge? }. Returns PNG dataUrl plus redacted ' +
      'metadata and untrusted content guidance. Use fullPage only when the task needs off-screen content.',
    dangerClass: 'read',
    source: 'builtin',
    inputSchema: { type: 'object' },
    requiresIdempotencyKey: false,
    aiTask: 'read_understand',
    category: 'browser',
  };
}

export function registerScreenshotTools(deps: { host: ScreenshotToolsHost }): void {
  const { host } = deps;
  CapabilityRegistry.register({
    descriptor: descriptor(),
    inputSchema: ScreenshotCaptureInputSchema,
    handler: async (args) => buildScreenshotSnapshot(await host.captureScreenshot(args)),
  });
}
