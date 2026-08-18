import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fixturesDir, scenariosDir } from './harness-config';
import { loadScenarios } from './scenario-registry';

/**
 * Plumbing guard over the REAL registry (the other registry tests drive a temp dir).
 *
 * This is the check a fixture freeze needs and unit tests do not otherwise give: every scenario in the
 * shipped exam parses, and every fixture it names actually exists on disk. A scenario pointing at a
 * missing fixture does not fail loudly at eval time — it fails as a "the agent could not do it" trial,
 * which reads as incompetence and quietly poisons a pass rate.
 *
 * **This is plumbing/regression, NOT competence.** Nothing here runs an agent.
 */
describe('the shipped scenario registry', () => {
  const { scenarios, errors } = loadScenarios(scenariosDir);

  it('parses with no malformed entries', () => {
    expect(errors).toEqual([]);
    expect(scenarios.length).toBeGreaterThan(0);
  });

  it('has a unique id per scenario (a duplicate would silently overwrite a result row)', () => {
    const ids = scenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names only fixtures that exist on disk', () => {
    const missing = scenarios
      .filter((s) => 'fixture' in s.target)
      .map((s) => ({ id: s.id, fixture: (s.target as { fixture: string }).fixture }))
      .filter(({ fixture }) => !existsSync(join(fixturesDir, fixture, 'index.html')));
    expect(missing).toEqual([]);
  });

  it('asserts something checkable per scenario (no scenario that can never fail)', () => {
    const unassertable = scenarios
      .filter(
        (s) =>
          s.success.domAssertion === undefined &&
          s.success.expectedValue === undefined &&
          s.success.stoppedReason === undefined &&
          s.success.judgeRubric === undefined,
      )
      .map((s) => s.id);
    expect(unassertable).toEqual([]);
  });
});
