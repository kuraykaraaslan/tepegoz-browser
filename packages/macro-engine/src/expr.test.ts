import { describe, it, expect } from 'vitest';
import { evalExpr, type Scope } from './expr';
import type { MacroValue } from './value';

const scopeOf = (vars: Record<string, MacroValue>): Scope => (n) => vars[n];

describe('evalExpr', () => {
  it('arithmetic with precedence', () => {
    expect(evalExpr('1 + 2 * 3', () => undefined)).toBe(7);
    expect(evalExpr('(1 + 2) * 3', () => undefined)).toBe(9);
    expect(evalExpr('10 % 3', () => undefined)).toBe(1);
    expect(evalExpr('7 / 0', () => undefined)).toBe(0); // safe divide-by-zero
  });

  it('string concat vs numeric add', () => {
    expect(evalExpr('"a" + "b"', () => undefined)).toBe('ab');
    expect(evalExpr('n + 1', scopeOf({ n: 41 }))).toBe(42);
    expect(evalExpr('"row-" + i', scopeOf({ i: 3 }))).toBe('row-3');
  });

  it('comparisons and boolean logic', () => {
    expect(evalExpr('n > 5 && n < 10', scopeOf({ n: 7 }))).toBe(true);
    expect(evalExpr('n == 0 || n == 10', scopeOf({ n: 10 }))).toBe(true);
    expect(evalExpr('!(a == b)', scopeOf({ a: 'x', b: 'y' }))).toBe(true);
  });

  it('variable lookup, arrays, indexing, .length', () => {
    expect(evalExpr('items.length', scopeOf({ items: ['a', 'b', 'c'] }))).toBe(3);
    expect(evalExpr('items[1]', scopeOf({ items: ['a', 'b', 'c'] }))).toBe('b');
    expect(evalExpr('name.length', scopeOf({ name: 'abcd' }))).toBe(4);
  });

  it('the modulo/loop-restart idiom that iMacros needed a JS EVAL hack for', () => {
    // SET Modulo_10 EVAL("var n='{{!LOOP}}'; ...; if(x==0){z=10}else{z=x}; z;")
    const s = scopeOf({ LOOP: 20 });
    expect(evalExpr('LOOP % 10 == 0', s)).toBe(true);
  });

  it('pure function allow-list', () => {
    expect(evalExpr('upper("hi")', () => undefined)).toBe('HI');
    expect(evalExpr('contains("hello", "ell")', () => undefined)).toBe(true);
    expect(evalExpr('substr("hello", 1, 3)', () => undefined)).toBe('ell');
    expect(evalExpr('max(3, 9, 5)', () => undefined)).toBe(9);
  });

  it('rejects anything outside the sandbox (no globals / no eval escape)', () => {
    expect(() => evalExpr('process', () => undefined)).not.toThrow(); // bare ident → '' (undefined var)
    expect(evalExpr('process', () => undefined)).toBe(''); // not the Node global
    expect(() => evalExpr('fetch("http://x")', () => undefined)).toThrow(); // unknown function
    expect(() => evalExpr('1 +', () => undefined)).toThrow();
  });
});
