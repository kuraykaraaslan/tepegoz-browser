import { describe, it, expect } from 'vitest';
import { runMacro } from './interpreter';
import { css, fakeHost, macro } from './interpreter.testkit';

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
});
