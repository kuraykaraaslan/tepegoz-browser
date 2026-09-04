import { describe, it, expect } from 'vitest';
import { evalExpr, type Scope } from './expr';
import type { MacroValue } from './value';

const scopeOf =
  (vars: Record<string, MacroValue>): Scope =>
  (n) =>
    vars[n];

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

  it('subtraction and unary minus', () => {
    expect(evalExpr('10 - 3 - 2', () => undefined)).toBe(5);
    expect(evalExpr('-n', scopeOf({ n: 4 }))).toBe(-4);
    expect(evalExpr('5 + -2', () => undefined)).toBe(3);
  });

  it('string escape in a literal, and string indexing', () => {
    expect(evalExpr('"a\\"b"', () => undefined)).toBe('a"b');
    expect(evalExpr('s[1]', scopeOf({ s: 'abc' }))).toBe('b');
    expect(evalExpr('s[9]', scopeOf({ s: 'abc' }))).toBe(''); // out of range → ''
    expect(evalExpr('n[0]', scopeOf({ n: 5 }))).toBe(''); // indexing a non-string/array → ''
  });

  it('tokenizer + parser error paths', () => {
    expect(() => evalExpr('a @ b', () => undefined)).toThrow(/unexpected character/);
    expect(() => evalExpr('s.nope', scopeOf({ s: 'x' }))).toThrow(/unknown member/);
    expect(() => evalExpr('"unclosed', () => undefined)).toThrow(/unterminated/);
  });

  it('len over an array; the rest of the string/number function allow-list', () => {
    expect(evalExpr('len(items)', scopeOf({ items: ['a', 'b'] }))).toBe(2);
    expect(evalExpr('lower("HI")', () => undefined)).toBe('hi');
    expect(evalExpr('trim("  x  ")', () => undefined)).toBe('x');
    expect(evalExpr('startsWith("hello", "he")', () => undefined)).toBe(true);
    expect(evalExpr('endsWith("hello", "lo")', () => undefined)).toBe(true);
    expect(evalExpr('indexOf("hello", "l")', () => undefined)).toBe(2);
    expect(evalExpr('substr("hello", 2)', () => undefined)).toBe('llo'); // no length arg
    expect(evalExpr('replace("a-b-c", "-", "_")', () => undefined)).toBe('a_b_c');
    expect(evalExpr('number("3.5")', () => undefined)).toBe(3.5);
    expect(evalExpr('int("3.9")', () => undefined)).toBe(3);
    expect(evalExpr('string(42)', () => undefined)).toBe('42');
    expect(evalExpr('abs(-7)', () => undefined)).toBe(7);
    expect(evalExpr('floor(2.9)', () => undefined)).toBe(2);
    expect(evalExpr('ceil(2.1)', () => undefined)).toBe(3);
    expect(evalExpr('round(2.5)', () => undefined)).toBe(3);
    expect(evalExpr('min(3, 9, 5)', () => undefined)).toBe(3);
  });

  it('an over-long expression is rejected before parsing', () => {
    expect(() => evalExpr('1'.repeat(4097), () => undefined)).toThrow(/too long/);
  });
});
