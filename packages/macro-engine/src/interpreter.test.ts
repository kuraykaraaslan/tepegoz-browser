import { describe, it, expect } from 'vitest';
import type { Macro, SelectorChain } from '@tepegoz/shared-types';
import { runMacro } from './interpreter';
import type { MacroHost } from './host';

/** A scriptable fake host that records the actions the interpreter drives + every sleep duration. */
function fakeHost(over: Partial<MacroHost> = {}): MacroHost & { log: string[]; sleeps: number[] } {
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

const macro = (steps: Macro['steps'], variables: Macro['variables'] = []): Macro => ({
  id: 'm',
  name: 'm',
  version: 1,
  variables,
  steps,
});

const css = (v: string): SelectorChain => [{ kind: 'css', value: v }];

describe('runMacro', () => {
  it('interpolates variables into navigate/fill', async () => {
    const host = fakeHost();
    const r = await runMacro(
      macro([
        { kind: 'navigate', url: 'https://x/{{user}}' },
        { kind: 'fill', target: css('#e'), value: '{{user}}@mail' },
      ]),
      host,
      { variables: { user: 'kuray' } },
    );
    expect(r.ok).toBe(true);
    expect(host.log).toEqual(['nav https://x/kuray', 'fill #e=kuray@mail']);
  });

  it('takes the else branch when the condition is false', async () => {
    const host = fakeHost({ pageContainsText: (t) => Promise.resolve(t === 'Welcome') });
    const r = await runMacro(
      macro([
        {
          kind: 'if',
          cond: { kind: 'textPresent', text: 'Error' },
          then: [{ kind: 'click', target: css('.retry') }],
          else: [{ kind: 'click', target: css('.ok') }],
        },
      ]),
      host,
    );
    expect(r.ok).toBe(true);
    expect(host.log).toEqual(['click .ok']);
  });

  it('runs nested repeat loops (answers no-nested-loops)', async () => {
    const host = fakeHost();
    await runMacro(
      macro([
        {
          kind: 'repeat',
          count: 2,
          body: [{ kind: 'repeat', count: 3, body: [{ kind: 'scroll', direction: 'down' }] }],
        },
      ]),
      host,
    );
    expect(host.log.filter((l) => l === 'scroll down')).toHaveLength(6);
  });

  it('repeat-while stops when the predicate flips (counter via setVar/expr)', async () => {
    const host = fakeHost();
    const r = await runMacro(
      macro(
        [
          {
            kind: 'repeat',
            while: { kind: 'varCompare', left: 'i', op: 'lt', right: '3' },
            body: [
              { kind: 'scroll', direction: 'down' },
              { kind: 'setVar', name: 'i', expr: 'i + 1' },
            ],
          },
        ],
        [{ name: 'i', initial: '0' }],
      ),
      host,
    );
    expect(r.ok).toBe(true);
    expect(host.log.filter((l) => l === 'scroll down')).toHaveLength(3);
    expect(r.variables.i).toBe(3);
  });

  it('forEachRow binds CSV columns and appends extracted values into an array', async () => {
    const host = fakeHost({
      readCsv: () =>
        Promise.resolve([
          { name: 'A', code: '1' },
          { name: 'B', code: '2' },
        ]),
      extract: () => Promise.resolve('ok'),
    });
    const r = await runMacro(
      macro([
        {
          kind: 'forEachRow',
          csvBlobHash: 'h',
          as: 'rownum',
          onEnd: 'stop',
          body: [
            { kind: 'fill', target: css('#name'), value: '{{name}}-{{code}}' },
            { kind: 'extract', target: css('.result'), into: 'results', append: true },
          ],
        },
      ]),
      host,
    );
    expect(r.ok).toBe(true);
    expect(host.log).toEqual(['fill #name=A-1', 'fill #name=B-2']);
    expect(r.variables.results).toEqual(['ok', 'ok']);
  });

  it('forEachRow restart repeats rows up to maxRows (the CSV-loop-restart use case)', async () => {
    const host = fakeHost({ readCsv: () => Promise.resolve([{ n: '1' }, { n: '2' }]) });
    await runMacro(
      macro([
        {
          kind: 'forEachRow',
          csvBlobHash: 'h',
          as: 'r',
          onEnd: 'restart',
          maxRows: 5,
          body: [{ kind: 'fill', target: css('#n'), value: '{{n}}' }],
        },
      ]),
      host,
    );
    expect(host.log).toEqual(['fill #n=1', 'fill #n=2', 'fill #n=1', 'fill #n=2', 'fill #n=1']);
  });

  it('reports the EXACT failing step on a waitFor miss (no opaque code)', async () => {
    const host = fakeHost({ waitFor: () => Promise.resolve(false) });
    const r = await runMacro(
      macro([
        { kind: 'click', target: css('.a') },
        { kind: 'waitFor', target: css('.never'), timeoutMs: 10 },
      ]),
      host,
    );
    expect(r.ok).toBe(false);
    expect(r.error?.where).toBe('step 2 (waitFor)');
    expect(r.error?.message).toContain('never appeared');
  });

  it('a hard assert aborts with a located error; soft continues', async () => {
    const host = fakeHost({ pageContainsText: () => Promise.resolve(false) });
    const hard = await runMacro(
      macro([{ kind: 'assert', predicate: { kind: 'textPresent', text: 'X' }, severity: 'hard' }]),
      host,
    );
    expect(hard.ok).toBe(false);
    expect(hard.error?.where).toBe('step 1 (assert)');

    const soft = await runMacro(
      macro([
        { kind: 'assert', predicate: { kind: 'textPresent', text: 'X' }, severity: 'soft' },
        { kind: 'click', target: css('.after') },
      ]),
      host,
    );
    expect(soft.ok).toBe(true);
    expect(host.log).toContain('click .after');
  });

  it('enforces a minimum 50ms gap after each browser operation (floor speed)', async () => {
    const host = fakeHost();
    await runMacro(
      macro([
        { kind: 'click', target: css('.a') },
        { kind: 'fill', target: css('#b'), value: 'x' },
        { kind: 'setVar', name: 'v', expr: '1' }, // not a browser op → not paced
        { kind: 'scroll', direction: 'down' },
      ]),
      host,
    );
    expect(host.sleeps).toEqual([50, 50, 50]);
  });

  it('clamps a below-floor minStepIntervalMs up to 50', async () => {
    const host = fakeHost();
    await runMacro(macro([{ kind: 'click', target: css('.a') }]), host, { minStepIntervalMs: 5 });
    expect(host.sleeps).toEqual([50]);
  });

  it('onError:skip swallows a failing step and continues (fixes iMacros !ERRORIGNORE)', async () => {
    const host = fakeHost({ waitFor: () => Promise.resolve(false) });
    const r = await runMacro(
      macro([
        { kind: 'waitFor', target: css('.never'), timeoutMs: 10, onError: 'skip' },
        { kind: 'click', target: css('.after') },
      ]),
      host,
    );
    expect(r.ok).toBe(true);
    expect(host.log).toContain('click .after');
  });

  it('onError:retry re-runs the step up to `retries` times, then succeeds', async () => {
    let attempts = 0;
    const host = fakeHost({
      click: (c) => {
        attempts++;
        if (attempts < 3) return Promise.reject(new Error('not yet'));
        return Promise.resolve(void [c]);
      },
    });
    const r = await runMacro(
      macro([{ kind: 'click', target: css('.flaky'), onError: 'retry', retries: 3 }]),
      host,
    );
    expect(r.ok).toBe(true);
    expect(attempts).toBe(3);
  });

  it('onError:retry fails the run once retries are exhausted (located error)', async () => {
    const host = fakeHost({ click: () => Promise.reject(new Error('always fails')) });
    const r = await runMacro(
      macro([{ kind: 'click', target: css('.flaky'), onError: 'retry', retries: 1 }]),
      host,
    );
    expect(r.ok).toBe(false);
    expect(r.error?.where).toBe('step 1 (click)');
  });

  it('honours the abort signal', async () => {
    const host = fakeHost();
    const controller = { aborted: false };
    const steps: Macro['steps'] = [];
    for (let i = 0; i < 5; i++) steps.push({ kind: 'scroll', direction: 'down' });
    // Abort after the first step runs.
    const onProgress = (): void => {
      controller.aborted = true;
    };
    const r = await runMacro(macro(steps), host, { signal: controller, onProgress });
    expect(r.aborted).toBe(true);
    expect(r.ok).toBe(false);
  });
});
