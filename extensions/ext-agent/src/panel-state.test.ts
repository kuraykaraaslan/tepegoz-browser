import { describe, it, expect } from 'vitest';
import {
  appendLiveDelta,
  applyAgentEvent,
  emptyGroupState,
  serializeConversationLog,
  type GroupState,
  type Turn,
} from './panel-state';
import type { AgentEvent } from './types';

/** Build an AgentEvent with sane defaults for the fields the log doesn't vary. */
function ev(kind: AgentEvent['kind'], message: string, ts: number, detail?: string): AgentEvent {
  return { runId: 'run-1', groupId: 'g1', kind, message, ts, ...(detail !== undefined ? { detail } : {}) };
}

// A fixed epoch-ms so the UTC timestamps in the transcript are deterministic.
const T0 = Date.UTC(2026, 6, 8, 9, 30, 0); // 2026-07-08T09:30:00Z

describe('serializeConversationLog', () => {
  it('renders a header, each turn prompt, and every event in order', () => {
    const turns: Turn[] = [
      {
        id: 't1',
        prompt: 'Book me a table',
        runId: 'run-1',
        events: [
          ev('plan', 'Plan the booking', T0),
          ev('step_start', 'open restaurant page', T0 + 1000, 'https://example.test'),
          ev('done', 'Done — table booked', T0 + 2000),
        ],
      },
    ];
    const out = serializeConversationLog(turns, {
      exportedAt: T0,
      groupId: 'g1',
      provider: 'anthropic',
      autonomy: 'ask',
      effort: 'high',
      tokens: { inputTokens: 10, outputTokens: 5, totalTokens: 15, quota: 0, lifetimeTokens: 0 },
    });

    expect(out).toContain('# Tepegöz Agent — Chat Log');
    expect(out).toContain('- Group: g1');
    expect(out).toContain('- Provider: anthropic');
    expect(out).toContain('- Tokens: 15 (10 in / 5 out)');
    expect(out).toContain('## Turn 1');
    expect(out).toContain('Book me a table');
    // Event lines carry the kind label, a UTC clock, and the detail as a sub-bullet.
    expect(out).toContain('`[09:30:00] Plan` Plan the booking');
    expect(out).toContain('`[09:30:01] Step start` open restaurant page');
    expect(out).toContain('  - https://example.test');
    expect(out).toContain('`[09:30:02] Response` Done — table booked');
    // Ordering: plan precedes step precedes response.
    expect(out.indexOf('Plan the booking')).toBeLessThan(out.indexOf('open restaurant page'));
    expect(out.indexOf('open restaurant page')).toBeLessThan(out.indexOf('Done — table booked'));
  });

  it('handles an empty conversation and empty prompts/events gracefully', () => {
    expect(serializeConversationLog([], { exportedAt: T0, groupId: null })).toContain(
      '_No messages in this conversation._',
    );
    const out = serializeConversationLog(
      [{ id: 't1', prompt: '   ', runId: null, events: [] }],
      { exportedAt: T0, groupId: null },
    );
    expect(out).toContain('_(empty)_');
    expect(out).toContain('_No agent events recorded._');
    // Optional metadata is omitted when absent (no stray "Provider:" line).
    expect(out).not.toContain('- Provider:');
    expect(out).not.toContain('- Group:');
  });
});

describe('applyAgentEvent (event→run routing that drives the pause/steer/stop controls)', () => {
  const evt = (kind: AgentEvent['kind'], runId: string): AgentEvent => ({
    runId,
    groupId: 'g1',
    kind,
    message: kind,
    ts: 0,
  });
  const turn = (id: string, runId: string | null, events: AgentEvent[] = []): Turn => ({
    id,
    prompt: id,
    runId,
    events,
  });
  const group = (over: Partial<GroupState>): GroupState => ({ ...emptyGroupState(), ...over });

  it('binds the freshly-started (unbound) last turn and populates the group runId (the pause-button fix)', () => {
    const cur = group({ running: true, turns: [turn('t1', null)] });
    const out = applyAgentEvent(cur, evt('plan', 'run-7'));
    // Before the fix this stayed null, so onPauseResume/onCancel/steer all read a null runId and no-op'd.
    expect(out.runId).toBe('run-7');
    expect(out.turns[0]?.runId).toBe('run-7');
    expect(out.turns[0]?.events).toHaveLength(1);
    expect(out.running).toBe(true);
  });

  it('flips paused on a paused event and clears it on resumed (active turn)', () => {
    const cur = group({ running: true, runId: 'run-7', turns: [turn('t1', 'run-7')] });
    const paused = applyAgentEvent(cur, evt('paused', 'run-7'));
    expect(paused.paused).toBe(true);
    expect(paused.running).toBe(true); // a hold is not a stop — controls stay live
    const resumed = applyAgentEvent(paused, evt('resumed', 'run-7'));
    expect(resumed.paused).toBe(false);
  });

  it('a terminal event clears running / paused / runId', () => {
    const cur = group({ running: true, paused: true, runId: 'run-7', turns: [turn('t1', 'run-7')] });
    const out = applyAgentEvent(cur, evt('done', 'run-7'));
    expect(out.running).toBe(false);
    expect(out.paused).toBe(false);
    expect(out.runId).toBeNull();
  });

  it('drops a straggler whose runId matches no turn (returns the same reference, no flag change)', () => {
    const cur = group({ running: true, runId: 'run-7', turns: [turn('t1', 'run-7')] });
    const out = applyAgentEvent(cur, evt('paused', 'run-OLD'));
    expect(out).toBe(cur); // a stale run's event cannot flip the live run's paused/running/runId
  });

  it('routes a late terminal from an aborted run to its OWN turn without touching the new live run (5b race)', () => {
    // run-1 was Stopped and run-2 started; run-1's late 'error' arrives while run-2 is the active turn.
    const cur = group({
      running: true,
      paused: false,
      runId: 'run-2',
      turns: [turn('t1', 'run-1', [evt('plan', 'run-1')]), turn('t2', 'run-2', [evt('plan', 'run-2')])],
    });
    const out = applyAgentEvent(cur, evt('error', 'run-1'));
    // The straggler lands on run-1's turn (t1)...
    expect(out.turns[0]?.events.at(-1)?.kind).toBe('error');
    // ...and does NOT terminate or re-flag the still-live run-2:
    expect(out.running).toBe(true);
    expect(out.runId).toBe('run-2');
    expect(out.turns[1]?.events).toHaveLength(1); // run-2's turn untouched
  });
});

describe('streamed model fragments (ADR-0025)', () => {
  const running = (): GroupState => ({
    ...emptyGroupState(),
    turns: [{ id: 't1', prompt: 'go', runId: 'run-1', events: [] }],
    running: true,
    runId: 'run-1',
  });

  it('accumulates fragments into the live tail', () => {
    const after = appendLiveDelta(appendLiveDelta(running(), 'think'), 'ing…');
    expect(after.liveDelta).toBe('thinking…');
  });

  it('keeps the tail bounded so a long turn cannot grow it without end', () => {
    const after = appendLiveDelta(running(), 'x'.repeat(1000));
    expect(after.liveDelta.length).toBe(400);
  });

  it('never puts a fragment in turns — the tail is not part of what gets persisted', () => {
    const after = appendLiveDelta(running(), 'partial');
    expect(after.turns[0]?.events).toEqual([]);
  });

  it('drops the tail as soon as a settled event supersedes it', () => {
    const streaming = appendLiveDelta(running(), 'half a decis');
    const settled = applyAgentEvent(streaming, ev('decision', 'browser_get_elements', T0));
    expect(settled.liveDelta).toBe('');
  });
});
