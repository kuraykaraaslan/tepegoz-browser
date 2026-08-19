import { describe, expect, it } from 'vitest';
import { CANVAS_DOMINANCE, evaluateVisionTrigger } from './vision-trigger';
import type { StepOutcome } from './executor';

function step(tool: string, result: unknown, over: Partial<StepOutcome> = {}): StepOutcome {
  return { stepId: 's', tool, ok: true, result, durationMs: 1, ...over };
}

const pageRead = step('browser_get_page', {
  content: 'Atlas Charts. A navigation menu and some figures are shown on this page.',
});
const elements = (list: unknown[], canvasFraction?: number): StepOutcome =>
  step('browser_get_elements', {
    elements: list,
    content: 'listing',
    ...(canvasFraction !== undefined ? { canvasFraction } : {}),
  });

describe('blind_page', () => {
  it('fires when a page with content yields no actionable elements', () => {
    // The `canvas-menu` and `closed-shadow-widget` shape.
    const trigger = evaluateVisionTrigger([pageRead, elements([])]);
    expect(trigger?.reason).toBe('blind_page');
    expect(trigger?.detail).toContain('nothing actionable');
  });

  it('fires when elements exist but NONE of them is named', () => {
    // The `image-only-button` shape: two controls, both meaningless to a DOM reader.
    const trigger = evaluateVisionTrigger([
      pageRead,
      elements([{ ref: 1, name: '', tag: 'button' }, { ref: 2, name: '   ', tag: 'button' }]),
    ]);
    expect(trigger?.reason).toBe('blind_page');
    expect(trigger?.detail).toContain('none of them named');
  });

  it('does NOT fire when even one element is named', () => {
    const trigger = evaluateVisionTrigger([
      pageRead,
      elements([{ ref: 1, name: '', tag: 'button' }, { ref: 2, name: 'Archive', tag: 'button' }]),
    ]);
    expect(trigger).toBeNull();
  });

  it('does NOT fire on a genuinely blank page — empty is not blind', () => {
    const trigger = evaluateVisionTrigger([
      step('browser_get_page', { content: '' }),
      elements([]),
    ]);
    expect(trigger).toBeNull();
  });

  it('does NOT fire without a page read to prove the page has content', () => {
    // Escalating here would be guessing: nothing observed says the page is non-blank.
    expect(evaluateVisionTrigger([elements([])])).toBeNull();
  });
});

describe('canvas_dominant', () => {
  it('fires when canvas covers enough of the viewport, and outranks the others', () => {
    const trigger = evaluateVisionTrigger([pageRead, elements([], CANVAS_DOMINANCE)]);
    expect(trigger?.reason).toBe('canvas_dominant');
    expect(trigger?.detail).toContain('%');
  });

  it('does not fire on an incidental small canvas', () => {
    const trigger = evaluateVisionTrigger([
      pageRead,
      elements([{ ref: 1, name: 'Save' }], 0.05),
    ]);
    expect(trigger).toBeNull();
  });

  it('treats an absent measurement as 0, never as coverage', () => {
    const trigger = evaluateVisionTrigger([pageRead, elements([{ ref: 1, name: 'Save' }])]);
    expect(trigger).toBeNull();
  });
});

describe('persistent_occlusion', () => {
  it('fires only after the click-time re-check has refused more than once', () => {
    const occluded = step('browser_update_page', { changed: false, occludedBy: '<div> "cookies"' });
    expect(evaluateVisionTrigger([elements([{ ref: 1, name: 'Accept' }]), occluded])).toBeNull();
    const trigger = evaluateVisionTrigger([elements([{ ref: 1, name: 'Accept' }]), occluded, occluded]);
    expect(trigger?.reason).toBe('persistent_occlusion');
  });
});

describe('repeated_action_failure', () => {
  it('fires when the same target is acted on repeatedly with no effect', () => {
    const noop = step('browser_update_page', { changed: false }, { args: { action: 'click', ref: 7 } });
    const trigger = evaluateVisionTrigger([elements([{ ref: 7, name: 'Next' }]), noop, noop]);
    expect(trigger?.reason).toBe('repeated_action_failure');
  });

  it('does not fire for repeated actions on DIFFERENT targets', () => {
    const a = step('browser_update_page', { changed: false }, { args: { action: 'click', ref: 1 } });
    const b = step('browser_update_page', { changed: false }, { args: { action: 'click', ref: 2 } });
    expect(evaluateVisionTrigger([elements([{ ref: 1, name: 'A' }]), a, b])).toBeNull();
  });

  it('does not fire when the action actually worked', () => {
    const ok = step('browser_update_page', { changed: true }, { args: { action: 'click', ref: 7 } });
    expect(evaluateVisionTrigger([elements([{ ref: 7, name: 'Next' }]), ok, ok])).toBeNull();
  });
});

describe('the negative controls', () => {
  it('stays silent on an ordinary page with named controls — the ≤5% rate depends on this', () => {
    const trigger = evaluateVisionTrigger([
      step('browser_get_page', { content: 'Supplier registration. Company name, contact person.' }),
      elements([
        { ref: 1, name: 'Company name' },
        { ref: 2, name: 'Register supplier' },
      ]),
      step('browser_update_page', { changed: true }, { args: { action: 'click', ref: 2 } }),
    ]);
    expect(trigger).toBeNull();
  });

  it('returns null for an empty run rather than escalating on no evidence', () => {
    expect(evaluateVisionTrigger([])).toBeNull();
  });

  it('only looks at the recent tail — an old blind page does not escalate a later step', () => {
    const old = [pageRead, elements([])];
    const now = [
      step('browser_get_page', { content: 'A perfectly ordinary page with plenty of text on it.' }),
      elements([{ ref: 1, name: 'Continue' }]),
    ];
    expect(evaluateVisionTrigger([...old, ...now], { tail: 2 })).toBeNull();
  });
});
