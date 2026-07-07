import { describe, expect, it } from 'vitest';
import { isDeveloperSettingsVisible } from './developer-env';

describe('isDeveloperSettingsVisible', () => {
  it('shows the Developer settings section only in development', () => {
    expect(isDeveloperSettingsVisible('development')).toBe(true);
    expect(isDeveloperSettingsVisible('production')).toBe(false);
    expect(isDeveloperSettingsVisible('test')).toBe(false);
  });
});
