import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadScenarios, partitionHeldOut } from './scenario-registry';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agent-eval-reg-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const scenario = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  task: `task ${id}`,
  target: { fixture: 'blog-behind-nav' },
  success: { domAssertion: 'Latest post' },
  ...extra,
});

function write(file: string, body: unknown): void {
  writeFileSync(join(dir, file), typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
}

describe('loadScenarios', () => {
  it('loads valid scenarios across files, sorted by file name', () => {
    write('a.json', { scenarios: [scenario('one')] });
    write('b.json', { scenarios: [scenario('two'), scenario('three')] });
    const { scenarios, errors } = loadScenarios(dir);
    expect(errors).toEqual([]);
    expect(scenarios.map((s) => s.id)).toEqual(['one', 'two', 'three']);
  });

  it('skips a malformed-JSON file and records the error (never throws)', () => {
    write('good.json', { scenarios: [scenario('ok')] });
    write('bad.json', '{ not json');
    const { scenarios, errors } = loadScenarios(dir);
    expect(scenarios.map((s) => s.id)).toEqual(['ok']);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.file).toBe('bad.json');
  });

  it('skips a schema-invalid scenario file (untrusted input) with a reason', () => {
    write('bad.json', {
      scenarios: [{ id: '', task: 't', target: { fixture: 'x' }, success: {} }],
    });
    const { scenarios, errors } = loadScenarios(dir);
    expect(scenarios).toEqual([]);
    expect(errors[0]?.reason).toContain('schema');
  });

  it('flags a duplicate scenario id and keeps the first', () => {
    write('a.json', { scenarios: [scenario('dup')] });
    write('b.json', { scenarios: [scenario('dup')] });
    const { scenarios, errors } = loadScenarios(dir);
    expect(scenarios).toHaveLength(1);
    expect(errors[0]?.reason).toContain('duplicate');
  });

  it('reports a missing registry dir instead of throwing', () => {
    const { scenarios, errors } = loadScenarios(join(dir, 'does-not-exist'));
    expect(scenarios).toEqual([]);
    expect(errors).toHaveLength(1);
  });
});

describe('partitionHeldOut', () => {
  it('splits dev and held-out scenarios', () => {
    write('a.json', {
      scenarios: [scenario('dev1'), scenario('held', { heldOut: true }), scenario('dev2')],
    });
    const { scenarios } = loadScenarios(dir);
    const { dev, heldOut } = partitionHeldOut(scenarios);
    expect(dev.map((s) => s.id)).toEqual(['dev1', 'dev2']);
    expect(heldOut.map((s) => s.id)).toEqual(['held']);
  });
});
