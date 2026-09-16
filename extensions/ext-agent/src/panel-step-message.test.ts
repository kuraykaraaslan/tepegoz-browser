import { describe, expect, it } from 'vitest';
import { coreDict } from '@tepegoz/i18n';
import { agentDict } from './i18n';
import { humanizeStepDetail, humanizeStepMessage } from './panel-step-message';

const a = agentDict.en;
const c = coreDict.en;

describe('humanizeStepMessage', () => {
  it('maps a step_ok / step_error to the localized intent + status glyph', () => {
    expect(humanizeStepMessage('step_ok', 'browser_get_page ✓', a)).toBe(
      `${a.toolIntent.browser_get_page} ✓`,
    );
    expect(humanizeStepMessage('step_error', 'browser_update_page ✗', a)).toBe(
      `${a.toolIntent.browser_update_page} ✗`,
    );
  });

  it('drops the ordinary "allow" decision from a step_start, keeping just the intent', () => {
    expect(humanizeStepMessage('step_start', 'browser_get_page: allow', a)).toBe(
      a.toolIntent.browser_get_page,
    );
  });

  it('shows a localized suffix for an ask / deny step_start', () => {
    expect(humanizeStepMessage('step_start', 'browser_update_page: ask', a)).toBe(
      `${a.toolIntent.browser_update_page} · ${a.stepDecision.ask}`,
    );
    expect(humanizeStepMessage('step_start', 'browser_update_location: deny', a)).toBe(
      `${a.toolIntent.browser_update_location} · ${a.stepDecision.deny}`,
    );
  });

  it('de-snakes an unmapped tool id rather than showing snake_case', () => {
    expect(humanizeStepMessage('step_ok', 'com_acme_do_thing ✓', a)).toBe('com acme do thing ✓');
  });

  it('returns anything that does not match a known shape untouched', () => {
    expect(humanizeStepMessage('step_start', 'act', a)).toBe('act');
    expect(humanizeStepMessage('plan', 'Open the site and read the title', a)).toBe(
      'Open the site and read the title',
    );
    expect(humanizeStepMessage('step_ok', 'weird message with no glyph', a)).toBe(
      'weird message with no glyph',
    );
  });
});

describe('humanizeStepDetail', () => {
  it('prefixes a known reason code with its Permission Debug title, keeping the raw code visible', () => {
    expect(humanizeStepDetail('read_allowed', c)).toBe(
      `${c.permissions.read_allowed.title} (read_allowed)`,
    );
  });

  it('preserves an intent-divergence suffix appended after the reason code', () => {
    const detail = 'read_allowed — intent divergence: goal mismatch';
    expect(humanizeStepDetail(detail, c)).toBe(
      `${c.permissions.read_allowed.title} (read_allowed) — intent divergence: goal mismatch`,
    );
  });

  it('returns an unrecognised code untouched — never a guessed title', () => {
    expect(humanizeStepDetail('some_future_reason_code', c)).toBe('some_future_reason_code');
  });

  it('passes undefined through unchanged', () => {
    expect(humanizeStepDetail(undefined, c)).toBeUndefined();
  });
});
