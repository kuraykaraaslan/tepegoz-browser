import { describe, it, expect } from 'vitest';
import { chainFrom, toStep, type Capture } from './capture-script';

describe('chainFrom', () => {
  it('prefers id, then css, then attr, then xpath, then text', () => {
    const cap: Capture = {
      type: 'click',
      id: 'submit',
      css: 'button.primary',
      xpath: '/html/body/button[1]',
      text: 'Submit',
      attr: { name: 'data-testid', value: 'go' },
    };
    expect(chainFrom(cap)).toEqual([
      { kind: 'css', value: '#submit' },
      { kind: 'css', value: 'button.primary' },
      { kind: 'attr', value: 'go', attr: 'data-testid' },
      { kind: 'xpath', value: '/html/body/button[1]' },
      { kind: 'text', value: 'Submit' },
    ]);
  });

  it('falls back to body when nothing is capturable', () => {
    expect(chainFrom({ type: 'click' })).toEqual([{ kind: 'css', value: 'body' }]);
  });
});

describe('toStep', () => {
  it('builds a click step', () => {
    expect(toStep({ type: 'click', id: 'x' })).toEqual({
      kind: 'click',
      target: [{ kind: 'css', value: '#x' }],
    });
  });

  it('inlines a typed value for a normal fill', () => {
    const step = toStep({ type: 'input', id: 'email', value: 'a@b.com' });
    expect(step).toEqual({
      kind: 'fill',
      target: [{ kind: 'css', value: '#email' }],
      value: 'a@b.com',
    });
  });

  it('redacts a secret field value to a {{secret}} placeholder (never inlined)', () => {
    const step = toStep({ type: 'input', id: 'pw', value: 'hunter2', secret: true });
    expect(step).toMatchObject({ kind: 'fill', value: '{{secret}}' });
  });
});
