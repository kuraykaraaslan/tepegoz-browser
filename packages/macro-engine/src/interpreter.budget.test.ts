import { describe, it, expect } from 'vitest';
import { runMacro } from './interpreter';
import { css, fakeHost, macro } from './interpreter.testkit';

describe('runMacro', () => {
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
});
