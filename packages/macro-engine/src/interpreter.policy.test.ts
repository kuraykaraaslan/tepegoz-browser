import { describe, it, expect } from 'vitest';
import { runMacro } from './interpreter';
import type { MacroPolicyStepKind } from './host';
import { PolicyDeniedError } from './errors';
import { css, fakeHost, macro } from './interpreter.testkit';

describe('runMacro', () => {
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
});
