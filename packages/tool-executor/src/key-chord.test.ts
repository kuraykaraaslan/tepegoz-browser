import { describe, expect, it } from 'vitest';
import { MAX_CHORD_STEPS, MODIFIER_BITS, parseChords } from './key-chord.js';

describe('parseChords', () => {
  it('parses a bare named key, restoring its canonical spelling', () => {
    expect(parseChords('enter').steps).toEqual([{ modifiers: 0, key: 'Enter' }]);
    expect(parseChords('ARROWDOWN').steps).toEqual([{ modifiers: 0, key: 'ArrowDown' }]);
  });

  it('parses a single modifier', () => {
    expect(parseChords('Ctrl+A').steps).toEqual([{ modifiers: MODIFIER_BITS.Control, key: 'A' }]);
    expect(parseChords('Shift+Tab').steps).toEqual([
      { modifiers: MODIFIER_BITS.Shift, key: 'Tab' },
    ]);
  });

  it('combines modifiers and accepts the spellings a model actually reaches for', () => {
    const ctrlShift = MODIFIER_BITS.Control | MODIFIER_BITS.Shift;
    expect(parseChords('Control+Shift+K').steps).toEqual([{ modifiers: ctrlShift, key: 'K' }]);
    expect(parseChords('cmd+k').steps).toEqual([{ modifiers: MODIFIER_BITS.Meta, key: 'k' }]);
    expect(parseChords('Option+ArrowLeft').steps).toEqual([
      { modifiers: MODIFIER_BITS.Alt, key: 'ArrowLeft' },
    ]);
  });

  it('reads a sequence separated by spaces or commas, in order', () => {
    expect(parseChords('Ctrl+A Delete').steps).toEqual([
      { modifiers: MODIFIER_BITS.Control, key: 'A' },
      { modifiers: 0, key: 'Delete' },
    ]);
    expect(parseChords('Tab, Tab, Enter').steps).toHaveLength(3);
  });

  it('keeps a "+" that IS the key (Ctrl++ is a real shortcut)', () => {
    expect(parseChords('Ctrl++').steps).toEqual([{ modifiers: MODIFIER_BITS.Control, key: '+' }]);
  });

  it('reports a modifier with no key rather than sending something arbitrary', () => {
    const parsed = parseChords('Ctrl+');
    expect(parsed.steps).toEqual([]);
    expect(parsed.malformed).toEqual(['Ctrl+']);
  });

  it('reports an unrecognised modifier instead of quietly sending a different keystroke', () => {
    const parsed = parseChords('Hyper+K');
    expect(parsed.steps).toEqual([]);
    expect(parsed.malformed).toEqual(['Hyper+K']);
  });

  it('bounds a chord string so it cannot become an input storm', () => {
    const parsed = parseChords(new Array(100).fill('Tab').join(' '));
    expect(parsed.steps).toHaveLength(MAX_CHORD_STEPS);
  });

  it('returns nothing at all for an empty string, without throwing', () => {
    expect(parseChords('   ')).toEqual({ steps: [], malformed: [] });
  });
});
