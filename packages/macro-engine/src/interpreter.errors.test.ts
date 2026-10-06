import { describe, it, expect } from 'vitest';
import type { Macro } from '@tepegoz/shared-types';
import { runMacro } from './interpreter';
import { css, fakeHost, macro } from './interpreter.testkit';

/**
 * One branch is deliberately left uncovered: the `?? 'stop'` inside
 * `'onError' in step ? (step.onError ?? 'stop') : 'stop'`. It needs a step object that HAS the
 * `onError` key with an undefined value, which `exactOptionalPropertyTypes` makes unconstructible
 * from typed code; the `in` check already answers the absent case.
 */

describe('runMacro', () => {
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
