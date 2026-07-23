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
      'Capture a PNG of the page and attach it to the run record (evidence/export). ' +
      'Args: { tabId?, mode?: "viewport"|"fullPage", maxEdge? }. ' +
      'IMPORTANT: you do NOT receive the image — only capture metadata (size, dimensions, url). It is ' +
      'therefore useless for reading the page or finding an element; use browser_get_page / ' +
      'browser_get_elements for that. Call this only when the user explicitly wants a screenshot saved.',
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
