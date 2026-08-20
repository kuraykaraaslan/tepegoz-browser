import { type MacroValue, toStr } from './value';
import { evalExpr, type Scope } from './expr';

/**
 * The run-scoped variable store: unlimited named variables + array values (answers iMacros' 3-var cap
 * and missing arrays). Interpolation and `setVar` go through the safe expression evaluator, so there
 * is never any `eval` of page/JS content.
 */
export class VariableStore {
  private readonly vars = new Map<string, MacroValue>();
  /** Names last set from untrusted web content (`extract`) — never storage, just a run-scoped flag. */
  private readonly taintedNames = new Set<string>();

  constructor(initial?: Record<string, MacroValue>) {
    if (initial) for (const [k, v] of Object.entries(initial)) this.vars.set(k, v);
  }

  /** A read-only scope for the expression evaluator. */
  readonly scope: Scope = (name) => this.vars.get(name);

  get(name: string): MacroValue | undefined {
    return this.vars.get(name);
  }

  /** A fresh assignment (`setVar`, CSV row binding, declared initial) — always clears prior taint. */
  set(name: string, value: MacroValue): void {
    this.vars.set(name, value);
    this.taintedNames.delete(name);
  }

  /** Append `value` to an array variable, creating/promoting as needed (for looped `extract`). */
  append(name: string, value: string): void {
    const cur = this.vars.get(name);
    if (Array.isArray(cur)) cur.push(value);
    else if (cur === undefined) this.vars.set(name, [value]);
    else this.vars.set(name, [toStr(cur), value]);
  }

  /** Mark `name`'s current value as derived from untrusted web content (called after `extract`). */
  taint(name: string): void {
    this.taintedNames.add(name);
  }

  /**
   * Conservative check: does any `{{...}}` block in `template` reference a tainted variable? Scans
   * identifier-like tokens inside each block rather than fully parsing the expression — a superset
   * match is the safe direction (never misses a real reference, may rarely over-flag).
   */
  isTemplateTainted(template: string): boolean {
    if (this.taintedNames.size === 0) return false;
    const blocks = template.match(/\{\{[^{}]+\}\}/g) ?? [];
    for (const block of blocks) {
      const idents = block.slice(2, -2).match(/[A-Za-z_]\w*/g) ?? [];
      if (idents.some((id) => this.taintedNames.has(id))) return true;
    }
    return false;
  }

  /** Evaluate a safe expression against the current variables. */
  evaluate(expr: string): MacroValue {
    return evalExpr(expr, this.scope);
  }

  /** Replace every `{{ expr }}` in `template` with the string value of the evaluated expression. */
  interpolate(template: string): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (_m, expr: string) =>
      toStr(evalExpr(expr.trim(), this.scope)),
    );
  }

  /** A plain snapshot of all variables (for the run result). */
  snapshot(): Record<string, MacroValue> {
    return Object.fromEntries(this.vars);
  }
}
