import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agreementRate, loadHumanLabels } from './calibration';

describe('agreementRate', () => {
  it('computes judge↔human agreement over the shared ids', () => {
    const judge = [
      { id: 'a', pass: true },
      { id: 'b', pass: false },
      { id: 'c', pass: true },
      { id: 'd', pass: true }, // not in human labels → ignored
    ];
    const human = [
      { id: 'a', pass: true }, // agree
      { id: 'b', pass: true }, // disagree
      { id: 'c', pass: true }, // agree
    ];
    const res = agreementRate(judge, human);
    expect(res.n).toBe(3);
    expect(res.agreements).toBe(2);
    expect(res.rate).toBeCloseTo(2 / 3);
    expect(res.disagreements).toEqual(['b']);
  });

  it('is vacuously calibrated (rate 1) when there is nothing to compare', () => {
    expect(agreementRate([], []).rate).toBe(1);
    expect(agreementRate([{ id: 'x', pass: true }], []).rate).toBe(1);
  });
});

describe('loadHumanLabels', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-eval-cal-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads a valid labels file', () => {
    const path = join(dir, 'labels.json');
    writeFileSync(path, JSON.stringify({ labels: [{ id: 'a', pass: true }] }), 'utf8');
    expect(loadHumanLabels(path)).toEqual([{ id: 'a', pass: true }]);
  });

  it('returns [] for a missing or invalid file (never throws)', () => {
    expect(loadHumanLabels(join(dir, 'nope.json'))).toEqual([]);
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{ not json', 'utf8');
    expect(loadHumanLabels(bad)).toEqual([]);
  });
});
