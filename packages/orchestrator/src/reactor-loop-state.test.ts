import { beforeEach, describe, it, expect } from 'vitest';
import { ModelGateway } from '@tepegoz/model-gateway';
import { CapabilityRegistry, ToolGateway } from '@tepegoz/capability-plane';
import Reactor from './reactor';
import { COLLAPSED_WORKING_STATE_PLACEHOLDER, WORKING_STATE_HEADER } from './reactor-working-state';
import {
  CapturingProvider,
  act,
  actWithState,
  fakeTool,
  finish,
  resetReactorFixtures,
  script,
  tools,
} from './reactor.test-support';

beforeEach(resetReactorFixtures);

describe('Reactor.run typed working state (C1)', () => {
  const req = () => ({
    goal: 'do it',
    tools: tools(),
    provider: 'anthropic' as const,
    model: 'mock',
  });

  it('injects the ledger into the messages the model receives, and merges across steps', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    const provider = new CapturingProvider([
      actWithState('browser_update_page', { completedSubtasks: ['added to cart'] }),
      actWithState('browser_get_elements', { pendingVerifications: ['confirm order placed'] }),
      finish,
    ]);
    ModelGateway.reset();
    ModelGateway.register(provider);
    await Reactor.run(req());

    // Turn 0 saw no ledger yet (it is emitted on turn 0's decision).
    const turn0 = provider.turns[0] ?? [];
    expect(turn0.some((m) => m.content.includes(WORKING_STATE_HEADER))).toBe(false);

    // Turn 1 receives the ledger with turn 0's sub-task.
    const turn1 = provider.turns[1] ?? [];
    const ledger1 = turn1.find((m) => m.content.includes(WORKING_STATE_HEADER));
    expect(ledger1?.content).toContain('added to cart');

    // Turn 2 receives the MERGED ledger (sub-task carried forward + the new pending verification), and only
    // the latest block is live — the earlier one is collapsed to the placeholder.
    const turn2 = provider.turns[2] ?? [];
    const liveLedgers = turn2.filter((m) => m.content.includes(WORKING_STATE_HEADER));
    expect(liveLedgers).toHaveLength(1);
    expect(liveLedgers[0]?.content).toContain('added to cart');
    expect(liveLedgers[0]?.content).toContain('confirm order placed');
    expect(turn2.some((m) => m.content === COLLAPSED_WORKING_STATE_PLACEHOLDER)).toBe(true);
  });

  it('injects nothing when the model never emits state (byte-identical legacy path)', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    const provider = new CapturingProvider([
      act('browser_get_elements'),
      act('browser_get_elements'),
      finish,
    ]);
    ModelGateway.reset();
    ModelGateway.register(provider);
    await Reactor.run(req());
    const injectedAnywhere = provider.turns.some((turn) =>
      turn.some(
        (m) =>
          m.content.includes(WORKING_STATE_HEADER) ||
          m.content === COLLAPSED_WORKING_STATE_PLACEHOLDER,
      ),
    );
    expect(injectedAnywhere).toBe(false);
  });
});

describe('Reactor.run no-progress replan (C1 PR2)', () => {
  const goalReq = () => ({
    goal: 'do it',
    tools: tools(),
    provider: 'anthropic' as const,
    model: 'mock',
  });

  /** Register a read tool + an update tool whose result is fixed, so we can drive stall vs progress. */
  function setupTools(updateResult: unknown): void {
    CapabilityRegistry.reset();
    ToolGateway.reset();
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    CapabilityRegistry.register(fakeTool('browser_get_elements', 'read', { content: 'els' }));
    CapabilityRegistry.register(fakeTool('browser_update_page', 'state_changing', updateResult));
  }

  it('fires a bounded replan after N no-progress acts and injects the new approach', async () => {
    // No `changed`/`filled`/`found` and a constant url ⇒ each VARIED update is a stall (exactly what the
    // identical-args loop detector misses). Varied refs keep the loop detector from tripping first.
    setupTools({ ok: true });
    const provider = new CapturingProvider([
      act('browser_update_page', { ref: 1 }),
      act('browser_update_page', { ref: 2 }),
      act('browser_update_page', { ref: 3 }),
      act('browser_update_page', { ref: 4 }),
      finish,
    ]);
    ModelGateway.reset();
    ModelGateway.register(provider);
    let replanCalls = 0;
    const res = await Reactor.run(goalReq(), {
      noProgressThreshold: 3,
      maxReplans: 1,
      replan: (ctx) => {
        replanCalls += 1;
        expect(ctx.reason).toContain('acting steps');
        return Promise.resolve({ guidance: 'Open the menu and re-read.' });
      },
    });
    expect(res.stoppedReason).toBe('completed');
    expect(replanCalls).toBe(1); // bounded by maxReplans
    // The 4th decision (turn index 3) must have seen the injected replan steer.
    const turn3 = provider.turns[3] ?? [];
    expect(turn3.some((m) => m.content.includes('Open the menu and re-read.'))).toBe(true);
    expect(turn3.some((m) => m.content.includes('DIFFERENT approach'))).toBe(true);
  });

  it('does not replan while the run is making progress (actions report changed:true)', async () => {
    setupTools({ changed: true, url: 'https://x', title: 'T' });
    script([
      act('browser_update_page', { ref: 1 }),
      act('browser_update_page', { ref: 2 }),
      act('browser_update_page', { ref: 3 }),
      act('browser_update_page', { ref: 4 }),
      finish,
    ]);
    let replanCalls = 0;
    const res = await Reactor.run(goalReq(), {
      noProgressThreshold: 3,
      maxReplans: 2,
      replan: () => {
        replanCalls += 1;
        return Promise.resolve(null);
      },
    });
    expect(res.stoppedReason).toBe('completed');
    expect(replanCalls).toBe(0);
  });

  it('fail-open: a throwing replan hook never kills the run', async () => {
    setupTools({ ok: true });
    script([
      act('browser_update_page', { ref: 1 }),
      act('browser_update_page', { ref: 2 }),
      act('browser_update_page', { ref: 3 }),
      act('browser_update_page', { ref: 4 }),
      finish,
    ]);
    const res = await Reactor.run(goalReq(), {
      noProgressThreshold: 3,
      maxReplans: 1,
      replan: () => Promise.reject(new Error('boom')),
    });
    expect(res.stoppedReason).toBe('completed');
  });

  /** C1 PR3: register a read-class escape tool + a normal read, so an escape does not trip the stall/loop
   *  detectors on its own — only the escape predicate should force the replan. */
  function setupEscapeTools(): void {
    CapabilityRegistry.reset();
    ToolGateway.reset();
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    CapabilityRegistry.register(fakeTool('web_search_items', 'read', { content: 'results' }));
    CapabilityRegistry.register(fakeTool('browser_get_elements', 'read', { content: 'els' }));
  }

  it('C1 PR3: an escape-tool call forces a replan on the next step (no accumulated stalls needed)', async () => {
    setupEscapeTools();
    script([act('web_search_items', { q: 'how to save' }), act('browser_get_elements'), finish]);
    let replanCalls = 0;
    let sawEscapeReason = false;
    const res = await Reactor.run(goalReq(), {
      // Defaults (threshold 6, maxReplans 2): a single escape must still force the replan.
      replan: (ctx) => {
        replanCalls += 1;
        if (ctx.reason.includes('acting steps')) sawEscapeReason = true;
        return Promise.resolve({ guidance: 'Stay on the page; operate the form.' });
      },
      isEscapeTool: (tool) => tool === 'web_search_items',
    });
    expect(res.stoppedReason).toBe('completed');
    expect(replanCalls).toBe(1);
    expect(sawEscapeReason).toBe(true);
  });

  it('C1 PR3: without an escape predicate, the same escape does NOT trigger replan (legacy path)', async () => {
    setupEscapeTools();
    script([act('web_search_items', { q: 'how to save' }), act('browser_get_elements'), finish]);
    let replanCalls = 0;
    const res = await Reactor.run(goalReq(), {
      replan: () => {
        replanCalls += 1;
        return Promise.resolve(null);
      },
      // no isEscapeTool
    });
    expect(res.stoppedReason).toBe('completed');
    expect(replanCalls).toBe(0);
  });
});
