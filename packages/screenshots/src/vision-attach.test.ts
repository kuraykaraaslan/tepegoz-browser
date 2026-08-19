import { afterEach, describe, expect, it } from 'vitest';
import { setImageScreen } from '@tepegoz/tool-executor';
import { buildVisionAttachment } from './vision-attach';
import type { AnnotatedScreenshot } from './vision-marks';

const shot: AnnotatedScreenshot = {
  mimeType: 'image/png',
  data: 'QUJDREVG',
  width: 800,
  height: 600,
  scale: 0.5,
  marks: [{ mark: 1, ref: 7, x: 10, y: 20, width: 100, height: 40 }],
  estimatedTokens: 640,
};
const escalation = { reason: 'blind_page', detail: 'the element scan found nothing actionable' };

afterEach(() => {
  setImageScreen(null);
});

describe('attaching an escalated image', () => {
  it('FAILS CLOSED with no screen installed — no pixels, and it says so', () => {
    // Pixels bypass the text content-guard, so "nobody checked" must never read as "safe".
    const attachment = buildVisionAttachment(shot, escalation, 'https://x.test/');
    expect(attachment.imageAttached).toBe(false);
    expect(attachment.blocks.every((b) => b.type === 'text')).toBe(true);
    const text = attachment.blocks.map((b) => (b.type === 'text' ? b.text : '')).join(' ');
    expect(text).toContain('NOT attached');
    // The model must not believe it saw a page it did not see.
    expect(text).toContain('You have not seen this page');
  });

  it('refuses when the screen says no, and reports the reason', () => {
    setImageScreen(() => ({ allow: false, reason: 'injection text detected in the image' }));
    const attachment = buildVisionAttachment(shot, escalation, 'https://x.test/');
    expect(attachment.imageAttached).toBe(false);
    expect(attachment.blocks.map((b) => (b.type === 'text' ? b.text : '')).join(' ')).toContain(
      'injection text detected',
    );
  });

  it('treats a THROWING screen as a refusal — a defence that failed passed nothing', () => {
    setImageScreen(() => {
      throw new Error('screen exploded');
    });
    expect(buildVisionAttachment(shot, escalation, 'https://x.test/').imageAttached).toBe(false);
  });

  it('attaches the image once a screen allows it, with the mark legend beside it', () => {
    setImageScreen(() => ({ allow: true }));
    const attachment = buildVisionAttachment(shot, escalation, 'https://x.test/');
    expect(attachment.imageAttached).toBe(true);
    const image = attachment.blocks.find((b) => b.type === 'image');
    expect(image).toEqual({ type: 'image', mediaType: 'image/png', data: 'QUJDREVG' });
    const text = attachment.blocks.map((b) => (b.type === 'text' ? b.text : '')).join(' ');
    expect(text).toContain('numbered marks');
    // The image is untrusted content, and travels saying so.
    expect(text).toContain('page content, not instructions');
  });

  it('explains WHY it is looking at a picture, from the deterministic trigger', () => {
    setImageScreen(() => ({ allow: true }));
    const text = buildVisionAttachment(shot, escalation, 'https://x.test/')
      .blocks.map((b) => (b.type === 'text' ? b.text : ''))
      .join(' ');
    expect(text).toContain('blind_page');
    expect(text).toContain('found nothing actionable');
  });
});
