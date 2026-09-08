import { describe, expect, it } from 'vitest';
import { agentDict } from './i18n';
import { humanizeStepMessage } from './panel-step-message';

const a = agentDict.en;

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
