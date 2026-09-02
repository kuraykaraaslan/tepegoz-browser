import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The pre-paint contract for every surface in this bundle.
 *
 * `index.html` is loaded by ALL of them — the main chrome window, each native popup window, and every
 * `tepegoz://` internal page — so whatever its inline `<style>` paints is the first thing on screen for
 * all of them at once. It used to paint `var(--surface-base, #0c2135)`, and that fallback was the menu
 * flash: the document paints before `tokens.css` and `main.tsx` have run, so the variable is still
 * unset and the popup came up brand navy over a purple theme before snapping to the real colour.
 *
 * The correct colour at that instant is already underneath — the main process resolves it from the
 * active theme (`lib/surface-theme.ts`) and sets it as the native `backgroundColor` of the window or
 * `WebContentsView`. So the document's job is to paint NOTHING and let it through. This test guards
 * that, because the regression is invisible in every unit test and shows up only as a flicker.
 */
const html = readFileSync(join(__dirname, 'index.html'), 'utf8');

/** The inline `<style>` block in `<head>` — the only CSS that applies before the bundle loads.
 *  Comments are stripped: the block explains the bug by naming the colour it used to paint, and a
 *  colour named in prose is not a colour anything renders. */
function preMountStyle(): string {
  const match = /<style>([\s\S]*?)<\/style>/.exec(html);
  expect(match, 'index.html should still carry an inline pre-mount <style>').not.toBeNull();
  return (match?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('the pre-paint ground', () => {
  it('paints nothing, so the native backgroundColor shows through until React mounts', () => {
    expect(preMountStyle()).toMatch(/background:\s*transparent\s*;/);
  });

  it('names no colour at all — a literal here is a colour the main process did not resolve', () => {
    // Catches the whole family of regressions, not just the navy that was there: any hex, rgb(), hsl()
    // or named colour reintroduces a ground that cannot track the user's theme.
    expect(preMountStyle()).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });
});
