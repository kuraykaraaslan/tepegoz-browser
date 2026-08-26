import { describe, expect, it } from 'vitest';
import { extractLaunchUrl } from './launch-url';

/**
 * Picking a URL out of a launch command line. Worth testing on its own because it runs on TWO different
 * argv shapes (cold-start `process.argv`, `second-instance`'s `commandLine`) and must not mistake a
 * binary path or a flag for the link the user actually clicked.
 */
describe('extractLaunchUrl', () => {
  it('finds an http(s) URL among unrelated argv entries', () => {
    expect(
      extractLaunchUrl(['C:\\Tepegöz\\Tepegöz.exe', '--some-flag', 'https://example.com/path']),
    ).toBe('https://example.com/path');
  });

  it('finds plain http, not only https', () => {
    expect(extractLaunchUrl(['Tepegöz.exe', 'http://example.com/'])).toBe('http://example.com/');
  });

  it('ignores the electron binary + app-directory pair from an unpackaged dev launch', () => {
    expect(extractLaunchUrl(['C:\\electron.exe', 'C:\\Users\\dev\\tepegoz-browser\\apps\\desktop'])).toBe(
      null,
    );
  });

  it('returns null when nothing looks like a URL', () => {
    expect(extractLaunchUrl(['Tepegöz.exe', '--flag', 'plain-argument'])).toBe(null);
  });

  it('returns null for an empty argv', () => {
    expect(extractLaunchUrl([])).toBe(null);
  });

  it('takes the FIRST URL when more than one is present', () => {
    expect(extractLaunchUrl(['Tepegöz.exe', 'https://first.example/', 'https://second.example/'])).toBe(
      'https://first.example/',
    );
  });
});
