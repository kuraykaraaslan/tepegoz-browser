/**
 * Promotes a recorded run from `.recording/` (gitignored, regenerable) to
 * `docs/website/runs/` (committed, publishable), sanitising it on the way.
 *
 * The split matters. `.recording/` holds whatever the last capture produced,
 * including runs that failed, runs that were re-recorded a minute later, and
 * runs nobody looked at. A file under `docs/website/runs/` is a claim: this run
 * happened, and the marketing site may replay it. Making that a deliberate copy
 * rather than a build step means nothing reaches the site because a script ran.
 *
 * ## What is removed, and why
 *
 * Identifiers that mean nothing off this machine and invite a reader to think
 * they mean something: `runId`, `groupId`, `planId`. They are local handles, not
 * evidence, and a UUID on a marketing page is noise that looks like provenance.
 *
 * ## What is NOT removed
 *
 * The failures. A trace whose `terminal` is `error`, whose events include a
 * `step_error`, or whose approvals show the kernel refusing something, publishes
 * exactly as it is. This script has no flag for dropping an event, and adding
 * one would turn a record into an edit.
 *
 * ## What it refuses
 *
 * A run that never started (no plan and no step), and a run whose events carry
 * more page text than a journal line should — the checked bound exists because a
 * real trace is the highest-risk privacy surface the site handles: it is made of
 * a real browsing session. It reports what it found and exits non-zero rather
 * than trimming, because a trace quietly cut down to fit is no longer the run.
 *
 *   node scripts/publish-trace.mjs [in-dir] --slug <name> [--force]
 */
import { join, resolve } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const IN = args.find((a) => !a.startsWith('--')) ?? '.recording';
const SLUG = flag('slug');
const FORCE = args.includes('--force');

if (!SLUG || !/^[a-z0-9][a-z0-9-]{2,60}$/.test(SLUG)) {
  console.error('usage: node scripts/publish-trace.mjs [in-dir] --slug <kebab-case-name> [--force]');
  process.exit(1);
}

const src = join(IN, 'agent-run.trace.json');
if (!existsSync(src)) {
  console.error(`no trace at ${src}. Record one first: node scripts/record-agent.mjs`);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(src, 'utf8'));

/** Longest single string a journal line may carry before this refuses to publish. */
const MAX_FIELD = 8000;

const problems = [];
if (raw.traceVersion !== 1) problems.push(`unknown traceVersion ${raw.traceVersion}`);
if (!Array.isArray(raw.events) || raw.events.length === 0) problems.push('no events');
if (!raw.plans?.length && !raw.events?.some((e) => e.kind?.startsWith('step_'))) {
  problems.push('no plan and no step — this run never started');
}
for (const [i, e] of (raw.events ?? []).entries()) {
  for (const f of ['message', 'detail']) {
    const v = e[f];
    if (typeof v === 'string' && v.length > MAX_FIELD) {
      problems.push(`events[${i}].${f} is ${v.length} chars (max ${MAX_FIELD}) — page text may have leaked into the journal`);
    }
  }
}
if (problems.length && !FORCE) {
  console.error('refusing to publish:');
  for (const p of problems) console.error('  -', p);
  console.error('\nFix the capture, or pass --force if you have read every line above and still mean it.');
  process.exit(1);
}
if (problems.length) {
  console.log('WARNING — publishing over these objections because --force was passed:');
  for (const p of problems) console.log('  -', p);
}

/* The date the run happened. Runs age: a viewer should be able to tell that a
   demo is from last year, and the capture itself does not record a date. */
const capturedOn = new Date(
  // Use the trace file's own mtime rather than "now", so re-publishing an old
  // capture does not silently re-date it.
  Number(process.env.SOURCE_DATE_EPOCH) * 1000 || (await import('node:fs')).statSync(src).mtimeMs,
)
  .toISOString()
  .slice(0, 10);

const doc = {
  traceVersion: 1,
  capturedBy: raw.capturedBy ?? 'scripts/record-agent.mjs',
  capturedOn,
  provider: raw.provider,
  autonomy: raw.autonomy,
  startUrl: raw.startUrl,
  task: raw.task,
  terminal: raw.terminal,
  durationMs: raw.durationMs,
  recordingStartsAtMs: raw.recordingStartsAtMs ?? null,
  plans: (raw.plans ?? []).map((p) => ({
    atMs: p.atMs,
    goal: p.goal,
    steps: (p.steps ?? []).map((s) => ({ id: s.id, tool: s.tool, rationale: s.rationale })),
  })),
  events: (raw.events ?? []).map((e) => ({
    kind: e.kind,
    atMs: e.atMs,
    message: e.message,
    ...(e.detail === undefined ? {} : { detail: e.detail }),
  })),
  approvals: (raw.approvals ?? []).map((a) => ({
    atMs: a.atMs,
    toolName: a.toolName,
    reason: a.reason,
    riskTier: a.riskTier ?? null,
    argsPreview: a.argsPreview,
  })),
  answeredByHarness: (raw.answeredByHarness ?? []).map((a) => ({
    kind: a.kind,
    button: a.button,
    atMs: a.atMs,
  })),
};

const outDir = resolve('docs/website/runs');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${SLUG}.trace.json`);
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

const kinds = {};
for (const e of doc.events) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
console.log(`wrote ${out}`);
console.log(`  captured ${doc.capturedOn} · provider ${doc.provider} · autonomy ${doc.autonomy} · ${doc.terminal}`);
console.log(`  ${doc.events.length} events ${JSON.stringify(kinds)}`);
console.log(`  ${doc.plans.length} plan(s), ${doc.approvals.length} approval(s), ${doc.answeredByHarness.length} answered by the harness`);
console.log('\nNext, in the website checkout:  node scripts/trace-sync.mjs ../tepegoz-browser');
