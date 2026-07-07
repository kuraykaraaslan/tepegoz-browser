/**
 * Deterministic omnibox inline calculator (L9). Pure, dependency-free, and — importantly — evaluates
 * arithmetic with a tiny recursive-descent parser, NEVER `eval`/`Function` (internal-ai-rules: no
 * dynamic code execution on user input). Returns null for anything that is not a self-contained
 * arithmetic expression so the omnibox can fall back to search/navigation.
 *
 * Supports: + - * / % , parentheses, unary minus, decimals, and fixed-ratio unit conversion.
 * Currency conversion is intentionally excluded because rates are live data, not deterministic math.
 */
import { evaluateOmniboxUnitConversion } from './omnibox-units';

export interface CalcResult {
  /** Canonical expression echoed back (trimmed input). */
  expression: string;
  value: number;
  /** Locale-agnostic display string (trailing-zero trimmed). */
  formatted: string;
}

type Token = { kind: 'num'; value: number } | { kind: 'op'; value: string };

const OPERATORS = new Set(['+', '-', '*', '/', '%', '(', ')']);

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i] ?? '';
    if (ch === ' ' || ch === '\t') {
      i += 1;
      continue;
    }
    if (ch >= '0' && ch <= '9') {
      let j = i;
      let dots = 0;
      while (j < input.length) {
        const c = input[j] ?? '';
        if (c >= '0' && c <= '9') {
          j += 1;
        } else if (c === '.') {
          dots += 1;
          if (dots > 1) return null;
          j += 1;
        } else {
          break;
        }
      }
      tokens.push({ kind: 'num', value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (ch === '.') {
      // a leading-dot number like ".5"
      let j = i + 1;
      while (j < input.length && (input[j] ?? '') >= '0' && (input[j] ?? '') <= '9') j += 1;
      if (j === i + 1) return null;
      tokens.push({ kind: 'num', value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (OPERATORS.has(ch)) {
      tokens.push({ kind: 'op', value: ch });
      i += 1;
      continue;
    }
    return null; // any other character → not an arithmetic expression
  }
  return tokens;
}

/** Recursive-descent parser/evaluator over the token stream. Throws on malformed input. */
class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    const value = this.expr();
    if (this.pos !== this.tokens.length) throw new Error('trailing tokens');
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private eatOp(op: string): boolean {
    const t = this.peek();
    if (t !== undefined && t.kind === 'op' && t.value === op) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  private expr(): number {
    let acc = this.term();
    for (;;) {
      if (this.eatOp('+')) acc += this.term();
      else if (this.eatOp('-')) acc -= this.term();
      else break;
    }
    return acc;
  }

  private term(): number {
    let acc = this.factor();
    for (;;) {
      if (this.eatOp('*')) {
        acc *= this.factor();
      } else if (this.eatOp('/')) {
        const d = this.factor();
        if (d === 0) throw new Error('division by zero');
        acc /= d;
      } else if (this.eatOp('%')) {
        const d = this.factor();
        if (d === 0) throw new Error('modulo by zero');
        acc %= d;
      } else {
        break;
      }
    }
    return acc;
  }

  private factor(): number {
    if (this.eatOp('-')) return -this.factor();
    if (this.eatOp('+')) return this.factor();
    if (this.eatOp('(')) {
      const value = this.expr();
      if (!this.eatOp(')')) throw new Error('unbalanced parentheses');
      return value;
    }
    const t = this.peek();
    if (t !== undefined && t.kind === 'num') {
      this.pos += 1;
      return t.value;
    }
    throw new Error('expected a number');
  }
}

/**
 * Evaluate `input` as arithmetic. Returns a result only when the WHOLE input is a valid expression
 * containing at least one operator (so a bare number or a search term is not treated as a calc).
 */
export function evaluateOmniboxCalc(input: string): CalcResult | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const conversion = evaluateOmniboxUnitConversion(trimmed);
  if (conversion !== null) {
    return {
      expression: conversion.expression,
      value: conversion.value,
      formatted: conversion.formatted,
    };
  }
  const tokens = tokenize(trimmed);
  if (tokens === null || tokens.length === 0) return null;
  // Require at least one binary operator — a lone "42" is not a calculation.
  const hasBinaryOp = tokens.some(
    (t, idx) => t.kind === 'op' && idx > 0 && ['+', '-', '*', '/', '%'].includes(t.value),
  );
  if (!hasBinaryOp) return null;

  let raw: number;
  try {
    raw = new Parser(tokens).parse();
  } catch {
    return null;
  }
  if (!Number.isFinite(raw)) return null;
  // Trim floating-point noise (e.g. 0.1 + 0.2) for both the value and its display form.
  const value = Math.round((raw + Number.EPSILON) * 1e10) / 1e10;
  return { expression: trimmed, value, formatted: String(value) };
}
