import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateSigningKeyPair } from './checkpoint';
import { buildReceipt, type ReplayReceipt } from './replay-receipt';
import { main } from './cli';
import type { ChainableEvent } from './hash-chain';

/** A fake writable stream that just collects what was written, so assertions read the printed text. */
function sink(): { write: (s: string) => boolean; text: () => string } {
  let buf = '';
  return { write: (s: string) => { buf += s; return true; }, text: () => buf };
}

const keys = generateSigningKeyPair();
const ev = (id: string): ChainableEvent => ({
  id,
  type: 'ToolInvoked',
  ts: 1,
  actor: 'agent',
  correlationId: 'run-1',
  payload: { x: 1 },
  redacted: true,
});

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tepegoz-verify-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function writeReceipt(receipt: ReplayReceipt): string {
  const path = join(dir, 'receipt.json');
  writeFileSync(path, JSON.stringify(receipt));
  return path;
}

describe('tepegoz-verify — the standalone CLI', () => {
  it('exits 0 and prints PASS for a genuine receipt', () => {
    const receipt = buildReceipt('run-1', 'device-1', [ev('a'), ev('b')], keys)!;
    const path = writeReceipt(receipt);
    const out = sink();
    const code = main(['node', 'cli.js', path], out);
    expect(code).toBe(0);
    expect(out.text()).toContain('PASS');
  });

  it('exits 1 and prints TAMPERED for a tampered receipt', () => {
    const receipt = buildReceipt('run-1', 'device-1', [ev('a'), ev('b')], keys)!;
    const tampered: ReplayReceipt = {
      ...receipt,
      events: receipt.events.map((e, i) => (i === 0 ? { ...e, payload: { x: 999 } } : e)),
    };
    const path = writeReceipt(tampered);
    const out = sink();
    const code = main(['node', 'cli.js', path], out);
    expect(code).toBe(1);
    expect(out.text()).toContain('TAMPERED');
  });

  it('exits 2 and prints INVALID for a file that is not JSON', () => {
    const path = join(dir, 'garbage.json');
    writeFileSync(path, 'not json at all {{{');
    const out = sink();
    const code = main(['node', 'cli.js', path], out);
    expect(code).toBe(2);
    expect(out.text()).toContain('INVALID');
  });

  it('exits 2 and prints INVALID for well-formed JSON that is not a receipt', () => {
    const path = join(dir, 'not-a-receipt.json');
    writeFileSync(path, JSON.stringify({ hello: 'world' }));
    const out = sink();
    const code = main(['node', 'cli.js', path], out);
    expect(code).toBe(2);
    expect(out.text()).toContain('INVALID');
  });

  it('exits 3 with a usage message when no path is given', () => {
    const out = sink();
    const err = sink();
    const code = main(['node', 'cli.js'], out, err);
    expect(code).toBe(3);
    expect(err.text()).toContain('usage:');
  });

  it('exits 3 with a clear message for a file that does not exist — never a raw stack trace', () => {
    const out = sink();
    const err = sink();
    const code = main(
      ['node', 'cli.js', join(dir, 'does-not-exist.json')],
      out,
      err,
    );
    expect(code).toBe(3);
    expect(err.text()).toContain('cannot read');
  });
});
