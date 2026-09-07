import { describe, it, expect } from 'vitest';
import type { Macro, SelectorChain } from '@tepegoz/shared-types';
import { runMacro } from './interpreter';
import type { MacroHost, MacroPolicyStepKind } from './host';
import { PolicyDeniedError } from './errors';

/**
 * One branch is deliberately left uncovered: the `?? 'stop'` inside
 * `'onError' in step ? (step.onError ?? 'stop') : 'stop'`. It needs a step object that HAS the
 * `onError` key with an undefined value, which `exactOptionalPropertyTypes` makes unconstructible
 * from typed code; the `in` check already answers the absent case.
 */

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

  describe('checkPolicy re-pass (L8)', () => {
    it('re-passes every state-changing step, and ONLY state-changing steps', async () => {
      const calls: Array<[MacroPolicyStepKind, boolean]> = [];
      const host = fakeHost({
        checkPolicy: (kind, tainted) => {
          calls.push([kind, tainted]);
          return Promise.resolve();
        },
      });
      const r = await runMacro(
        macro([
          { kind: 'navigate', url: 'https://x' },
          { kind: 'click', target: css('.a') },
          { kind: 'fill', target: css('#b'), value: 'v' },
          { kind: 'press', key: 'Enter' },
          { kind: 'scroll', direction: 'down' },
          { kind: 'extract', target: css('.c'), into: 'v' }, // a READ — not policy-gated
          { kind: 'setVar', name: 'x', expr: '1' }, // not a browser op at all
        ]),
        host,
      );
      expect(r.ok).toBe(true);
      expect(calls).toEqual([
        ['navigate', false],
        ['click', false],
        ['fill', false],
        ['press', false],
        ['scroll', false],
      ]);
    });

    it('a PolicyDeniedError (sensitive-site lockout) aborts with a located error', async () => {
      const host = fakeHost({
        checkPolicy: () => Promise.reject(new PolicyDeniedError('sensitive_site_lockout')),
      });
      const r = await runMacro(
        macro([
          { kind: 'click', target: css('.a') },
          { kind: 'click', target: css('.b') },
        ]),
        host,
      );
      expect(r.ok).toBe(false);
      expect(r.error?.where).toBe('step 1 (click)');
      expect(r.error?.message).toContain('sensitive_site_lockout');
      expect(host.log).toEqual([]); // never reached the actual click
    });

    it('a policy denial is NEVER swallowed by onError:skip', async () => {
      const host = fakeHost({ checkPolicy: () => Promise.reject(new PolicyDeniedError('nope')) });
      const r = await runMacro(
        macro([{ kind: 'click', target: css('.a'), onError: 'skip' }]),
        host,
      );
      expect(r.ok).toBe(false);
      expect(r.error?.message).toContain('nope');
    });

    it('a policy denial is NEVER retried by onError:retry', async () => {
      let attempts = 0;
      const host = fakeHost({
        checkPolicy: () => {
          attempts++;
          return Promise.reject(new PolicyDeniedError('nope'));
        },
      });
      const r = await runMacro(
        macro([{ kind: 'click', target: css('.a'), onError: 'retry', retries: 3 }]),
        host,
      );
      expect(r.ok).toBe(false);
      expect(attempts).toBe(1); // no retry loop around the policy check itself
    });

    it('taints the variable an extract wrote, flows through interpolation into a later step', async () => {
      const calls: Array<[MacroPolicyStepKind, boolean]> = [];
      const host = fakeHost({
        extract: () => Promise.resolve('secret-value'),
        checkPolicy: (kind, tainted) => {
          calls.push([kind, tainted]);
          return Promise.resolve();
        },
      });
      const r = await runMacro(
        macro([
          { kind: 'extract', target: css('.price'), into: 'p' },
          { kind: 'fill', target: css('#out'), value: 'price: {{p}}' }, // tainted
          { kind: 'navigate', url: 'https://x?q={{p}}' }, // also tainted
          { kind: 'setVar', name: 'p', expr: '"clean"' }, // fresh assignment clears taint
          { kind: 'fill', target: css('#out2'), value: '{{p}}' }, // no longer tainted
        ]),
        host,
      );
      expect(r.ok).toBe(true);
      expect(calls).toEqual([
        ['fill', true],
        ['navigate', true],
        ['fill', false],
      ]);
    });
  });

  it('defaults a declared variable with no initial to the empty string', async () => {
    const host = fakeHost();
    await runMacro(
      macro([{ kind: 'navigate', url: 'https://x/{{who}}' }], [{ name: 'who' }]),
      host,
    );
    expect(host.log).toEqual(['nav https://x/']);
  });

  it('runs waitFor / waitLoad / waitMs, honouring a per-step timeout over the default', async () => {
    const seen: number[] = [];
    const host = fakeHost({
      waitFor: (_c, ms) => {
        seen.push(ms);
        return Promise.resolve(true);
      },
      waitForLoad: (ms) => {
        seen.push(ms);
        return Promise.resolve();
      },
    });
    const r = await runMacro(
      macro([
        { kind: 'waitFor', target: css('#a'), timeoutMs: 1234 },
        { kind: 'waitFor', target: css('#b') },
        { kind: 'waitLoad', timeoutMs: 4321 },
        { kind: 'waitLoad' },
        { kind: 'waitMs', ms: 77 },
      ]),
      host,
      { defaultWaitMs: 999 },
    );
    expect(r.ok).toBe(true);
    expect(seen).toEqual([1234, 999, 4321, 999]);
    expect(host.sleeps).toContain(77);
  });

  it('takes the then branch when the condition holds', async () => {
    const host = fakeHost({ pageContainsText: (t) => Promise.resolve(t === 'Error') });
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
    expect(host.log).toEqual(['click .retry']);
  });

  it('an if with no else branch simply does nothing when the condition is false', async () => {
    const host = fakeHost({ pageContainsText: () => Promise.resolve(false) });
    const r = await runMacro(
      macro([
        {
          kind: 'if',
          cond: { kind: 'textPresent', text: 'Error' },
          then: [{ kind: 'click', target: css('.retry') }],
        },
      ]),
      host,
    );
    expect(r.ok).toBe(true);
    expect(host.log).toEqual([]);
  });

  it('forEachRow over an empty CSV runs the body zero times rather than once', async () => {
    const host = fakeHost({ readCsv: () => Promise.resolve([]) });
    const r = await runMacro(
      macro([
        {
          kind: 'forEachRow',
          csvBlobHash: 'h',
          as: 'i',
          onEnd: 'stop',
          body: [{ kind: 'click', target: css('.row') }],
        },
      ]),
      host,
    );
    expect(r.ok).toBe(true);
    expect(host.log).toEqual([]);
  });

  it('stops a run that exceeds its step budget, naming the step it stopped on', async () => {
    const host = fakeHost();
    const r = await runMacro(
      macro([
        { kind: 'scroll', direction: 'down' },
        { kind: 'scroll', direction: 'down' },
        { kind: 'scroll', direction: 'down' },
      ]),
      host,
      { maxSteps: 2 },
    );
    expect(r.ok).toBe(false);
    expect(r.error?.message).toBe('Exceeded step budget (2)');
    expect(r.error?.path).toEqual([2]);
    expect(host.log).toHaveLength(2);
  });

  it('stops a while loop whose body is EMPTY, which the schema allows', async () => {
    // Regression. `body` has no minimum length, so this macro is valid — and the budget check inside
    // the loop used to be unreachable, because `stepsRun` only moved inside `executeStep` and an
    // empty body never gets there. The loop then spun without yielding to the macrotask queue, so
    // nothing could interrupt it: not the abort signal, not a test timeout. It hung the process.
    //
    // The host yields on purpose here: if this regresses, the loop gives the event loop a turn and
    // this test times out with a failure, instead of hanging the whole suite.
    const host = fakeHost({
      elementExists: () => new Promise((resolve) => setTimeout(() => resolve(true), 0)),
    });
    const r = await runMacro(
      macro([
        {
          kind: 'repeat',
          while: { kind: 'elementExists', target: css('#forever') },
          body: [],
        },
      ]),
      host,
      { maxSteps: 5 },
    );
    expect(r.ok).toBe(false);
    expect(r.error?.message).toBe('Exceeded step budget (5)');
  });

  it('reports progress: started then step then done, and a located failed phase', async () => {
    const events: string[] = [];
    await runMacro(macro([{ kind: 'scroll', direction: 'down' }]), fakeHost(), {
      onProgress: (e) => {
        events.push('kind' in e && e.kind !== undefined ? `${e.phase}:${e.kind}` : e.phase);
      },
    });
    expect(events).toEqual(['started', 'step:scroll', 'done']);

    const failures: unknown[] = [];
    await runMacro(
      macro([{ kind: 'waitFor', target: css('#gone') }]),
      fakeHost({ waitFor: () => Promise.resolve(false) }),
      {
        onProgress: (e) => {
          if (e.phase === 'failed') failures.push(e);
        },
      },
    );
    expect(failures[0]).toMatchObject({
      phase: 'failed',
      kind: 'waitFor',
      path: [0],
      detail: 'waitFor: element never appeared',
    });
  });

  it('reports the retry and skipped phases as they happen', async () => {
    const events: string[] = [];
    let attempts = 0;
    const host = fakeHost({
      click: () => {
        attempts++;
        return attempts < 2 ? Promise.reject(new Error('flaky')) : Promise.resolve();
      },
      scroll: () => Promise.reject(new Error('always down')),
    });
    await runMacro(
      macro([
        { kind: 'click', target: css('.a'), onError: 'retry', retries: 2 },
        { kind: 'scroll', direction: 'down', onError: 'skip' },
      ]),
      host,
      {
        onProgress: (e) => {
          if (e.phase === 'step') events.push(e.kind);
        },
      },
    );
    expect(events).toEqual(['click', 'click:retry', 'scroll', 'scroll:skipped']);
  });

  it('coerces a non-Error thrown by the host into a located message', async () => {
    // Anything can be thrown across a host boundary, and `.message` on a bare string is undefined —
    // an error with no message is the opposite of this engine's "never an opaque code" promise.
    const thrown = 'the frame went away' as unknown as Error;
    const host = fakeHost({ click: () => Promise.reject(thrown) });
    const r = await runMacro(macro([{ kind: 'click', target: css('.a') }]), host);
    expect(r.ok).toBe(false);
    expect(r.error?.message).toBe('the frame went away');
    expect(r.error?.path).toEqual([0]);
  });

  it('coerces a non-Error thrown by the POLICY check the same way', async () => {
    const thrown = 'kernel said no' as unknown as Error;
    const host = fakeHost({ checkPolicy: () => Promise.reject(thrown) });
    const r = await runMacro(macro([{ kind: 'click', target: css('.a') }]), host);
    expect(r.ok).toBe(false);
    expect(r.error?.message).toBe('kernel said no');
  });

  it('lets an abort raised inside a nested step through the parent step error policy', async () => {
    // The abort is raised by the INNER step and travels out through the enclosing repeat's own
    // catch, which must rethrow it rather than treat it as a flaky page action worth retrying.
    const controller = new AbortController();
    const host = fakeHost({
      scroll: () => {
        controller.abort();
        return Promise.resolve();
      },
    });
    const r = await runMacro(
      macro([
        {
          kind: 'repeat',
          count: 5,
          body: [
            { kind: 'scroll', direction: 'down' },
            { kind: 'click', target: css('.a'), onError: 'retry', retries: 3 },
          ],
        },
      ]),
      host,
      { signal: controller.signal },
    );
    expect(r.aborted).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('does not swallow an error thrown by the progress listener itself', async () => {
    // A broken listener must not come back as a failed MACRO — that would blame the page for a bug
    // in the caller.
    await expect(
      runMacro(macro([{ kind: 'scroll', direction: 'down' }]), fakeHost(), {
        onProgress: (e) => {
          if (e.phase === 'step') throw new Error('listener blew up');
        },
      }),
    ).rejects.toThrow('listener blew up');
  });
});
