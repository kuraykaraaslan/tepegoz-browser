import { type MacroValue, toBool, toNum, toStr } from './value';

/**
 * A tiny, **safe, deterministic** expression evaluator — the sandboxed replacement for iMacros'
 * `EVAL(...)` of arbitrary inline JavaScript (the source of its worst maintenance/security pain). It
 * evaluates a closed grammar over the variable store only: literals, variable refs, arithmetic,
 * string concat, comparisons, boolean logic, indexing/`.length`, and a fixed allow-list of pure
 * functions. There is NO access to globals, the DOM, the network, or `eval` — it cannot escape.
 *
 * Grammar (precedence low→high): `||` · `&&` · equality `== !=` · comparison `< <= > >=` ·
 * additive `+ -` (`+` concatenates when either side is a string) · multiplicative `* / %` · unary
 * `- !` · postfix `[index]` / `.length` · primary (number/string/bool/ident/call/`( )`).
 */

export type Scope = (name: string) => MacroValue | undefined;

const MAX_LEN = 4096;
const FUNCS = new Set([
  'len',
  'upper',
  'lower',
  'trim',
  'contains',
  'startsWith',
  'endsWith',
  'substr',
  'replace',
  'number',
  'string',
  'int',
  'abs',
  'floor',
  'ceil',
  'round',
  'min',
  'max',
  'indexOf',
]);

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'eof' };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  const two = new Set(['==', '!=', '<=', '>=', '&&', '||']);
  while (i < n) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      let s = '';
      i++;
      while (i < n && src[i] !== c) {
        if (src[i] === '\\' && i + 1 < n) {
          i++;
          s += src[i];
        } else {
          s += src[i];
        }
        i++;
      }
      if (i >= n) throw new Error('unterminated string literal');
      i++; // closing quote
      toks.push({ t: 'str', v: s });
      continue;
    }
    if ((c >= '0' && c <= '9') || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let num = '';
      while (i < n && /[0-9.]/.test(src[i]!)) {
        num += src[i];
        i++;
      }
      toks.push({ t: 'num', v: Number(num) });
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let id = '';
      while (i < n && /[a-zA-Z0-9_]/.test(src[i]!)) {
        id += src[i];
        i++;
      }
      toks.push({ t: 'id', v: id });
      continue;
    }
    const pair = src.slice(i, i + 2);
    if (two.has(pair)) {
      toks.push({ t: 'op', v: pair });
      i += 2;
      continue;
    }
    if ('+-*/%<>()[],.!'.includes(c)) {
      toks.push({ t: 'op', v: c });
      i++;
      continue;
    }
    throw new Error(`unexpected character '${c}'`);
  }
  toks.push({ t: 'eof' });
  return toks;
}

class Parser {
  private pos = 0;
  constructor(
    private readonly toks: Tok[],
    private readonly scope: Scope,
  ) {}

  private peek(): Tok {
    return this.toks[this.pos]!;
  }
  private next(): Tok {
    return this.toks[this.pos++]!;
  }
  private eatOp(v: string): void {
    const tok = this.next();
    if (tok.t !== 'op' || tok.v !== v) throw new Error(`expected '${v}'`);
  }
  private isOp(v: string): boolean {
    const tok = this.peek();
    return tok.t === 'op' && tok.v === v;
  }

  parse(): MacroValue {
    const v = this.parseOr();
    if (this.peek().t !== 'eof') throw new Error('trailing tokens');
    return v;
  }

  private parseOr(): MacroValue {
    let left = this.parseAnd();
    while (this.isOp('||')) {
      this.next();
      const right = this.parseAnd();
      left = toBool(left) || toBool(right);
    }
    return left;
  }
  private parseAnd(): MacroValue {
    let left = this.parseEquality();
    while (this.isOp('&&')) {
      this.next();
      const right = this.parseEquality();
      left = toBool(left) && toBool(right);
    }
    return left;
  }
  private parseEquality(): MacroValue {
    let left = this.parseCompare();
    while (this.isOp('==') || this.isOp('!=')) {
      const op = this.next() as { t: 'op'; v: string };
      const right = this.parseCompare();
      const eq = toStr(left) === toStr(right);
      left = op.v === '==' ? eq : !eq;
    }
    return left;
  }
  private parseCompare(): MacroValue {
    let left = this.parseAdd();
    while (this.isOp('<') || this.isOp('<=') || this.isOp('>') || this.isOp('>=')) {
      const op = this.next() as { t: 'op'; v: string };
      const a = toNum(left);
      const b = toNum(this.parseAdd());
      left = op.v === '<' ? a < b : op.v === '<=' ? a <= b : op.v === '>' ? a > b : a >= b;
    }
    return left;
  }
  private parseAdd(): MacroValue {
    let left = this.parseMul();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.next() as { t: 'op'; v: string };
      const right = this.parseMul();
      if (op.v === '+') {
        // `+` concatenates when either side is a (non-numeric) string, else adds.
        left =
          typeof left === 'string' || typeof right === 'string'
            ? toStr(left) + toStr(right)
            : toNum(left) + toNum(right);
      } else {
        left = toNum(left) - toNum(right);
      }
    }
    return left;
  }
  private parseMul(): MacroValue {
    let left = this.parseUnary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const op = this.next() as { t: 'op'; v: string };
      const a = toNum(left);
      const b = toNum(this.parseUnary());
      left = op.v === '*' ? a * b : op.v === '/' ? (b === 0 ? 0 : a / b) : b === 0 ? 0 : a % b;
    }
    return left;
  }
  private parseUnary(): MacroValue {
    if (this.isOp('-')) {
      this.next();
      return -toNum(this.parseUnary());
    }
    if (this.isOp('!')) {
      this.next();
      return !toBool(this.parseUnary());
    }
    return this.parsePostfix();
  }
  private parsePostfix(): MacroValue {
    let val = this.parsePrimary();
    for (;;) {
      if (this.isOp('[')) {
        this.next();
        const idx = toNum(this.parseOr());
        this.eatOp(']');
        val = Array.isArray(val)
          ? (val[idx] ?? '')
          : typeof val === 'string'
            ? (val[idx] ?? '')
            : '';
      } else if (this.isOp('.')) {
        this.next();
        const member = this.next();
        if (member.t !== 'id') throw new Error('expected member name');
        if (member.v === 'length') {
          val = Array.isArray(val) ? val.length : toStr(val).length;
        } else {
          throw new Error(`unknown member '.${member.v}'`);
        }
      } else {
        return val;
      }
    }
  }
  private parsePrimary(): MacroValue {
    const tok = this.next();
    if (tok.t === 'num') return tok.v;
    if (tok.t === 'str') return tok.v;
    if (tok.t === 'op' && tok.v === '(') {
      const v = this.parseOr();
      this.eatOp(')');
      return v;
    }
    if (tok.t === 'id') {
      if (tok.v === 'true') return true;
      if (tok.v === 'false') return false;
      if (this.isOp('(')) return this.parseCall(tok.v);
      return this.scope(tok.v) ?? '';
    }
    throw new Error('unexpected token');
  }
  private parseCall(name: string): MacroValue {
    if (!FUNCS.has(name)) throw new Error(`unknown function '${name}'`);
    this.eatOp('(');
    const args: MacroValue[] = [];
    if (!this.isOp(')')) {
      args.push(this.parseOr());
      while (this.isOp(',')) {
        this.next();
        args.push(this.parseOr());
      }
    }
    this.eatOp(')');
    return applyFunc(name, args);
  }
}

function applyFunc(name: string, a: MacroValue[]): MacroValue {
  const s = (i: number): string => toStr(a[i] ?? '');
  const num = (i: number): number => toNum(a[i] ?? 0);
  switch (name) {
    case 'len':
      return Array.isArray(a[0]) ? a[0].length : s(0).length;
    case 'upper':
      return s(0).toUpperCase();
    case 'lower':
      return s(0).toLowerCase();
    case 'trim':
      return s(0).trim();
    case 'contains':
      return s(0).includes(s(1));
    case 'startsWith':
      return s(0).startsWith(s(1));
    case 'endsWith':
      return s(0).endsWith(s(1));
    case 'indexOf':
      return s(0).indexOf(s(1));
    case 'substr':
      return a[2] === undefined ? s(0).slice(num(1)) : s(0).slice(num(1), num(1) + num(2));
    case 'replace':
      return s(0).split(s(1)).join(s(2));
    case 'number':
    case 'int': {
      const v = num(0);
      return name === 'int' ? Math.trunc(v) : v;
    }
    case 'string':
      return s(0);
    case 'abs':
      return Math.abs(num(0));
    case 'floor':
      return Math.floor(num(0));
    case 'ceil':
      return Math.ceil(num(0));
    case 'round':
      return Math.round(num(0));
    case 'min':
      return Math.min(...a.map((_, i) => num(i)));
    case 'max':
      return Math.max(...a.map((_, i) => num(i)));
    default:
      throw new Error(`unknown function '${name}'`);
  }
}

/**
 * Evaluate a safe expression against a variable scope. Throws on a malformed expression (the caller
 * turns that into a located `MacroError`). Bounded input length guards against pathological cost.
 */
export function evalExpr(src: string, scope: Scope): MacroValue {
  if (src.length > MAX_LEN) throw new Error('expression too long');
  return new Parser(tokenize(src), scope).parse();
}
