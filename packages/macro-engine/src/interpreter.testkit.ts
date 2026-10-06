import type { Macro, SelectorChain } from '@tepegoz/shared-types';
import type { MacroHost } from './host';

/** A scriptable fake host that records the actions the interpreter drives + every sleep duration. */
export function fakeHost(over: Partial<MacroHost> = {}): MacroHost & { log: string[]; sleeps: number[] } {
  const log: string[] = [];
  const sleeps: number[] = [];
  const sel = (c: SelectorChain): string => c[0]?.value ?? '?';
  const rec = (line: string): Promise<void> => {
    log.push(line);
    return Promise.resolve();
  };
  const base: MacroHost = {
    navigate: (url) => rec(`nav ${url}`),
    click: (c) => rec(`click ${sel(c)}`),
    fill: (c, v) => rec(`fill ${sel(c)}=${v}`),
    press: (k) => rec(`press ${k}`),
    scroll: (d) => rec(`scroll ${d}`),
    extract: (c) => Promise.resolve(`text-of-${sel(c)}`),
    waitFor: () => Promise.resolve(true),
    waitForLoad: () => Promise.resolve(),
    elementExists: () => Promise.resolve(true),
    elementVisible: () => Promise.resolve(true),
    pageContainsText: () => Promise.resolve(false),
    readCsv: () => Promise.resolve([]),
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  };
  return Object.assign(base, over, { log, sleeps });
}

export const macro = (steps: Macro['steps'], variables: Macro['variables'] = []): Macro => ({
  id: 'm',
  name: 'm',
  version: 1,
  variables,
  steps,
});

export const css = (v: string): SelectorChain => [{ kind: 'css', value: v }];
