import { z } from 'zod';
import {
  MAX_SCREENSHOT_MAX_EDGE,
  MIN_SCREENSHOT_MAX_EDGE,
  SCREENSHOT_MODES,
  type ScreenshotCaptureInput,
  type ScreenshotCaptureResult,
} from './index';

export const ScreenshotModeSchema = z.enum(SCREENSHOT_MODES);

export const ScreenshotCaptureInputSchema = z.object({
  tabId: z.string().min(1).max(128).optional(),
  mode: ScreenshotModeSchema.optional(),
  maxEdge: z.number().int().min(MIN_SCREENSHOT_MAX_EDGE).max(MAX_SCREENSHOT_MAX_EDGE).optional(),
}) satisfies z.ZodType<ScreenshotCaptureInput>;

export const ScreenshotCaptureResultSchema = z.object({
  url: z.string().max(4096),
  title: z.string().max(2048),
  mode: ScreenshotModeSchema,
  mimeType: z.literal('image/png'),
  dataUrl: z.string().startsWith('data:image/png;base64,'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  pageWidth: z.number().int().positive(),
  pageHeight: z.number().int().positive(),
  byteLength: z.number().int().positive(),
  capturedAt: z.number().int().nonnegative(),
  truncated: z.boolean().optional(),
}) satisfies z.ZodType<ScreenshotCaptureResult>;
