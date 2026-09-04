// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import * as Icons from './SettingsPage-icons';

/**
 * Pure presentation — one FontAwesome wrapper per settings sidebar section. No behaviour to pin; the
 * only thing worth guarding is that every exported wrapper actually renders an icon (a wrong import
 * name would render nothing and the section row would lose its glyph silently).
 */

afterEach(cleanup);

describe('SettingsPage-icons', () => {
  it('every exported Icon* wrapper renders an svg, hidden from the a11y tree', () => {
    const entries = Object.entries(Icons).filter(([name]) => name.startsWith('Icon'));
    expect(entries.length).toBeGreaterThan(15);
    for (const [name, Comp] of entries) {
      const { container } = render(<Comp />);
      const svg = container.querySelector('svg');
      expect(svg, name).not.toBeNull();
      expect(svg?.getAttribute('aria-hidden'), name).toBe('true');
    }
  });
});
