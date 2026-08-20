export { runMacro, type RunOptions, type RunProgress, type RunResult } from './interpreter';
export { evalPredicate } from './predicate';
export { VariableStore } from './variables';
export { evalExpr, type Scope } from './expr';
export { MacroError, MacroAborted, PolicyDeniedError } from './errors';
export { type MacroValue, toStr, toNum, toBool } from './value';
export type { MacroHost, MacroPolicyStepKind } from './host';
