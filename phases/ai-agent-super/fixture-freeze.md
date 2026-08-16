# Fixture Freeze — the frozen baseline exam (S0 PR0)

**Frozen:** 2026-08-16 · **Owner:** [S0](phase-s0-truth-and-repair.md) PR0 · **Authority:**
[`constitution.md`](constitution.md) — *fixture freeze before capability code*

This file is the **exam record**. [S0](phase-s0-truth-and-repair.md) adds **zero** scenarios to
[`../../packages/agent-eval`](../../packages/agent-eval): the 52-scenario / 8-registry set below is the
baseline exam, frozen *before* any capability code of this program is written. Every later S-phase adds
its own scenarios in its own **PR0** and cites this record to prove which base its delta was measured
against.

## The frozen set — 52 scenarios across 8 registry files

Registry root: [`../../packages/agent-eval/scenarios/`](../../packages/agent-eval/scenarios/) (loaded by
[`harness-config.ts`](../../packages/agent-eval/src/harness-config.ts) `scenariosDir`, zod-validated per
file by [`scenario-registry.ts`](../../packages/agent-eval/src/scenario-registry.ts) —
`EvalScenarioFileSchema.safeParse`, the registry is untrusted disk input).

| Registry file | Scenarios | SHA-256 of file bytes |
|---|---:|---|
| `acceptance.json` | 6 | `e9edb7db1f07acd15e9e9f1e3b655831246ba3b12a45039d46e768086dba9f74` |
| `action-vocabulary.json` | 1 | `b8b40bcde68e2a9a7f5e635bc49a485df2b292131cac5035447093c8963f0b34` |
| `adversarial-battery.json` | 24 | `2ae473111e2d5df629037821cc972d8bddd418cd801c6e393ec0c64680887321` |
| `navigation-grounding.json` | 3 | `538ef60eb8bd81a7bfb1efa479c82a49a81d4be9dcf868fb38bf09458d5d43b0` |
| `network-verification.json` | 1 | `40da695b1457678ead7a515ddc166f43c0fa31f812a802be35ae3942ef473e76` |
| `perception.json` | 5 | `2c445fe3e19c0e8c9ec42da9fedd32d31cf7c49b8459003cbd6f2fd4a4dda776` |
| `real-failures.json` | 3 | `da29fa99bf7a37dc71c1cdd956282535c3a085598f209f3d55709e1865554dba` |
| `web-patterns.json` | 9 | `5256f2d8ea3e03952621c8b940377cdd78806531ce579e0989aa327d6edea2b5` |
| **Total** | **52** | — |

The 24 `atk_*` scenarios in `adversarial-battery.json` are the attack battery landed by v2 C7-PR1
(`4cf2caa`); [S0](phase-s0-truth-and-repair.md) PR4 produces their **first live numbers** (N=3, caveated),
and [S6](phase-s6-safety-control-plane.md) owns the claim-grade N≥10 ASR run.

## Regenerating this table

Run from the repo root — the output must match the table above byte-for-byte, or the freeze has been
broken and the breaking PR owes an explanation:

```sh
node -e "
const fs=require('fs'),cr=require('crypto'),p='packages/agent-eval/scenarios';
let tot=0;
for(const f of fs.readdirSync(p).filter(x=>x.endsWith('.json')).sort()){
  const buf=fs.readFileSync(p+'/'+f); tot+=JSON.parse(buf.toString()).scenarios.length;
  console.log(f, JSON.parse(buf.toString()).scenarios.length, cr.createHash('sha256').update(buf).digest('hex'));
}
console.log('TOTAL', tot);"
```

## Rules this record enforces

1. **No phase authors and passes its own exam in one PR.** A phase's scenarios land in its PR0, before
   its capability code.
2. **A delta is only comparable against a named base.** Every [`eval-results.md`](eval-results.md) entry
   states which freeze record it measured against — this one until a later PR0 supersedes it.
3. **A changed hash is a disclosure event**, not a silent edit. Editing a frozen scenario changes the
   exam; the PR that does it says so and re-baselines the affected family.
4. **Held-out protection.** `heldOut` scenarios (partitioned by
   [`partitionHeldOut`](../../packages/agent-eval/src/scenario-registry.ts)) are never used to steer
   prompt or code changes — only to report.
