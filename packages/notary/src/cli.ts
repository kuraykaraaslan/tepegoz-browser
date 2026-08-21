#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { verifyReceipt } from './replay-receipt';
import { parseReceipt } from './receipt-schema';

/**
 * `tepegoz-verify` — the standalone Replay Receipt verifier (Phase 7 NotaryService).
 *
 * "Standalone" is a requirement, not a description: this file imports nothing from `apps/desktop`,
 * opens no database, and makes no network call. Anyone who can run Node can run this against a `.json`
 * receipt someone handed them and get an answer that does not depend on trusting whoever produced the
 * receipt to also grade it — an auditor checking a vendor's claim is the reason this command exists.
 *
 * Exit codes double as the machine-readable result, because this is meant to be run from a script as
 * often as by a person reading the printed line:
 *   0 = PASS · 1 = TAMPERED · 2 = INVALID (wrong shape — not evidence of tampering) · 3 = usage error
 */

/** The minimal write surface this needs — narrower than `NodeJS.WriteStream` so a plain test double
 *  (or any stream-like object) can stand in without satisfying Node's full stream interface. */
export interface Writable {
  write(chunk: string): unknown;
}

export function main(
  argv: readonly string[],
  out: Writable = process.stdout,
  err: Writable = process.stderr,
): number {
  const path = argv[2];
  if (path === undefined) {
    err.write('usage: tepegoz-verify <receipt.json>\n');
    return 3;
  }

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (readErr) {
    err.write(
      `cannot read ${path}: ${readErr instanceof Error ? readErr.message : String(readErr)}\n`,
    );
    return 3;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    out.write('INVALID — not valid JSON\n');
    return 2;
  }

  const receipt = parseReceipt(parsedJson);
  if (receipt === null) {
    out.write('INVALID — does not match the receipt shape\n');
    return 2;
  }

  const verdict = verifyReceipt(receipt);
  if (verdict.status === 'PASS') {
    out.write(
      `PASS — ${receipt.correlationId} verified (${String(receipt.events.length)} events)\n`,
    );
    return 0;
  }
  if (verdict.status === 'TAMPERED') {
    out.write(`TAMPERED — ${verdict.reason}\n`);
    return 1;
  }
  out.write(`INVALID — ${verdict.reason}\n`);
  return 2;
}

// Only run when invoked directly (`node cli.js …` / the `tepegoz-verify` bin) — never as a side effect
// of another module importing this file, which is what would happen without this guard given `main` is
// also exported for the test suite.
const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  process.exitCode = main(process.argv);
}
