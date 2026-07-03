import type { Predicate } from '@tepegoz/shared-types';
import type { MacroHost } from './host';
import type { VariableStore } from './variables';
import { toNum, toStr } from './value';

/** Evaluate a deterministic, model-free condition (used by `if`, `repeat while`, and `assert`). */
export async function evalPredicate(
  pred: Predicate,
  host: MacroHost,
  vars: VariableStore,
): Promise<boolean> {
  switch (pred.kind) {
    case 'elementExists':
      return host.elementExists(pred.target);
    case 'elementVisible':
      return host.elementVisible(pred.target);
    case 'textPresent':
      return host.pageContainsText(vars.interpolate(pred.text));
    case 'textAbsent':
      return !(await host.pageContainsText(vars.interpolate(pred.text)));
    case 'varCompare':
      return compareVars(pred.left, pred.op, pred.right, vars);
    case 'and': {
      for (const p of pred.all) if (!(await evalPredicate(p, host, vars))) return false;
      return true;
    }
    case 'or': {
      for (const p of pred.any) if (await evalPredicate(p, host, vars)) return true;
      return false;
    }
    case 'not':
      return !(await evalPredicate(pred.of, host, vars));
  }
}

function compareVars(
  left: string,
  op: Extract<Predicate, { kind: 'varCompare' }>['op'],
  right: string,
  vars: VariableStore,
): boolean {
  const l = vars.evaluate(left);
  const r = vars.evaluate(right);
  switch (op) {
    case 'eq':
      return toStr(l) === toStr(r);
    case 'ne':
      return toStr(l) !== toStr(r);
    case 'lt':
      return toNum(l) < toNum(r);
    case 'lte':
      return toNum(l) <= toNum(r);
    case 'gt':
      return toNum(l) > toNum(r);
    case 'gte':
      return toNum(l) >= toNum(r);
    case 'contains':
      return toStr(l).includes(toStr(r));
    case 'matches':
      try {
        return new RegExp(toStr(r)).test(toStr(l));
      } catch {
        return false;
      }
  }
}
