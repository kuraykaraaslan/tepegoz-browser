import { describe, expect, it } from 'vitest';
import { AGENT_EXTENSION_ID, nextAgentDock } from './agent-dock';

const OTHER = 'com.tepegoz.popup-blocker';

describe('nextAgentDock', () => {
  it('closes the Agent Console when the active tab has no group', () => {
    // The reported bug: open the agent (its group is created), then add a plain new tab — the panel
    // used to follow along, open but with no session to talk to.
    expect(nextAgentDock(AGENT_EXTENSION_ID, null, true)).toBeNull();
  });

  it('leaves another docked extension alone on an ungrouped tab', () => {
    expect(nextAgentDock(OTHER, null, undefined)).toBe(OTHER);
  });

  it('restores the group\'s remembered open state', () => {
    expect(nextAgentDock(null, 'g1', true)).toBe(AGENT_EXTENSION_ID);
    expect(nextAgentDock(AGENT_EXTENSION_ID, 'g1', false)).toBeNull();
  });

  it('leaves the dock untouched for a group with no remembered value', () => {
    expect(nextAgentDock(AGENT_EXTENSION_ID, 'g2', undefined)).toBe(AGENT_EXTENSION_ID);
    expect(nextAgentDock(null, 'g2', undefined)).toBeNull();
  });

  it('never yanks away a different extension the user docked', () => {
    expect(nextAgentDock(OTHER, 'g1', true)).toBe(OTHER);
    expect(nextAgentDock(OTHER, 'g1', false)).toBe(OTHER);
  });
});
