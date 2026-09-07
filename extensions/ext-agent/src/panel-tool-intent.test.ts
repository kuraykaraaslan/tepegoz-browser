import { describe, expect, it } from 'vitest';
import { toolIntent } from './panel-tool-intent';
import { agentDict } from './i18n';

const en = agentDict.en;
const tr = agentDict.tr;

describe('toolIntent', () => {
  it('maps a known tool id to its localized intent', () => {
    expect(toolIntent('browser_get_page', en)).toBe('Reading the page');
    expect(toolIntent('web_search_items', en)).toBe('Searching the web');
    expect(toolIntent('browser_get_page', tr)).toBe('Sayfa okunuyor');
  });

  it('falls back to a de-snaked phrase for an unrecognised id', () => {
    expect(toolIntent('mcp_frobnicate_widget', en)).toBe('mcp frobnicate widget');
    // No leading/trailing/doubled spaces from odd ids.
    expect(toolIntent('__weird__id__', en)).toBe('weird id');
  });

  it('never returns a bare snake_case identifier', () => {
    for (const id of ['browser_get_page', 'tab_create_item', 'x_y_z', 'single']) {
      expect(toolIntent(id, en)).not.toMatch(/_/);
    }
  });

  it('has full en/tr parity for the intent table', () => {
    expect(Object.keys(en.toolIntent).sort()).toEqual(Object.keys(tr.toolIntent).sort());
  });
});
