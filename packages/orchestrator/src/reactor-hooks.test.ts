import { beforeEach, describe, it, expect } from 'vitest';
import { CapabilityRegistry, ToolGateway } from '@tepegoz/capability-plane';
import Reactor from './reactor';
import { act, fakeTool, finish, resetReactorFixtures, script, tools } from './reactor.test-support';

beforeEach(resetReactorFixtures);

describe('Reactor.run — navigation grounding + validator resilience', () => {
  const req = (goal = 'do it') => ({
    goal,
    tools: tools(),
    provider: 'anthropic' as const,
    model: 'mock',
  });

  it('folds a navigation-grounding hint into the conversation after a browser_get_elements read', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([act('browser_get_elements'), finish]);
    const seen: Array<[string, string]> = [];
    const res = await Reactor.run(req('open the blog'), {
      groundNavigation: (outcome, goal) => {
        seen.push([outcome.tool, goal]);
        return Promise.resolve('Grounded route → https://x/blog (a link visible on this page)');
      },
    });
    expect(res.stoppedReason).toBe('completed');
    expect(seen).toEqual([['browser_get_elements', 'open the blog']]);
  });

  it('a grounding hook that returns null pushes nothing and the run continues', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([act('browser_get_elements'), finish]);
    const res = await Reactor.run(req(), { groundNavigation: () => Promise.resolve(null) });
    expect(res.stoppedReason).toBe('completed');
  });

  it('aborts right after grounding when the signal was tripped during the hook', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([act('browser_get_elements'), finish, finish]);
    const signal = { aborted: false };
    const res = await Reactor.run(req(), {
      signal,
      groundNavigation: () => {
        signal.aborted = true;
        return Promise.resolve('hint');
      },
    });
    expect(res.stoppedReason).toBe('aborted');
  });

  it('a validateCompletion that THROWS fails open to "not done" — a validator hiccup never kills the run', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([finish, act('browser_get_elements'), finish, finish]);
    let n = 0;
    const res = await Reactor.run(req(), {
      maxSteps: 4,
      validateCompletion: () => {
        n += 1;
        return n === 1
          ? Promise.reject(new Error('validator boom'))
          : Promise.resolve({ done: true, finalAnswer: 'recovered' });
      },
    });
    expect(res.stoppedReason).toBe('completed');
    expect(res.summary).toBe('recovered');
    expect(n).toBeGreaterThanOrEqual(2);
  });
});

describe('Reactor.run — run-control gate (mid-run steering + abort)', () => {
  const req = (goal = 'do it') => ({
    goal,
    tools: tools(),
    provider: 'anthropic' as const,
    model: 'mock',
  });

  type Ctl = import('./run-control').RunControl;
  const control = (over: Partial<Ctl> = {}): Ctl => ({
    aborted: false,
    isHeld: () => false,
    waitWhileHeld: () => Promise.resolve(),
    drainSteer: () => [],
    modelSignal: () => new AbortController().signal,
    enterOfflineHold: () => undefined,
    enterHandoffHold: () => undefined,
    ...over,
  });

  it('folds a drained steer message into the conversation before the next decision', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([act('browser_get_elements'), finish]);
    let drained = false;
    const res = await Reactor.run(req(), {
      control: control({
        drainSteer: () => {
          if (drained) return [];
          drained = true;
          return ['also check the archive'];
        },
      }),
    });
    expect(res.stoppedReason).toBe('completed');
    expect(drained).toBe(true);
  });

  it('stops with stoppedReason "aborted" when control.aborted is set at the gate', async () => {
    script([finish]);
    const res = await Reactor.run(req(), { control: control({ aborted: true }) });
    expect(res.stoppedReason).toBe('aborted');
  });
});

describe('Reactor.run — urlFromOutcome tolerates a malformed result URL', () => {
  it('does not throw when a tool result carries an unparseable url', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    CapabilityRegistry.reset();
    CapabilityRegistry.register(fakeTool('browser_get_elements', 'read', { url: 'http://[' }));
    script([act('browser_get_elements'), finish]);
    const res = await Reactor.run(
      {
        goal: 'go',
        tools: tools(),
        provider: 'anthropic' as const,
        model: 'mock',
      },
      { recallMemory: () => Promise.resolve(null) },
    );
    expect(res.stoppedReason).toBe('completed');
  });
});
