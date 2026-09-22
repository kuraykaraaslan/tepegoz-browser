import { useState } from 'react';
import type { SettingsStrings } from '@tepegoz/settings-ui';
import type { NetworkConnectionView } from '@tepegoz/desktop-ipc';
import type { ConnectionTestResult, NetworkTestStage } from '@tepegoz/shared-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faCircleCheck,
  faCircleExclamation,
  faCircleMinus,
} from '@fortawesome/free-solid-svg-icons';
import { Button, cn } from '@tepegoz/ui';
import { classifyNetworkError } from './network-error';
import { parseConnectionTestResult } from './network-test';

/**
 * The manual "test this connection" action (Phase 5 onboarding: "import a config, name it, test it, and
 * see a plain-language result; a failed test says which step failed").
 *
 * Deliberately a button on the EXISTING connection row rather than a separate wizard — the manager
 * already covers "import a config, name it, save it"; this adds the missing "and see whether it actually
 * works, in plain language" step right where the connection lives, so it can be run immediately after
 * adding one or any time later.
 *
 * Every failed stage's sentence is `classifyNetworkError` — the SAME classifier the connections overview
 * and the health card already use for a `lastError` — so "what a live drop says" and "what testing ahead
 * of time says" are the same words, never a second taxonomy invented for this panel. `reachability` is
 * shown separately from the two pass/fail/skip stages: it folds DNS-through-the-tunnel and exit
 * reachability into one honest, coarse read-out rather than a third fabricated stage (see
 * `ConnectionTestResultSchema`'s docstring in `@tepegoz/shared-types` for why neither is independently
 * checked yet).
 */

function stageVisual(status: NetworkTestStage['status']): { icon: IconDefinition; tone: string } {
  if (status === 'pass') return { icon: faCircleCheck, tone: 'text-success' };
  if (status === 'skipped') return { icon: faCircleMinus, tone: 'text-text-disabled' };
  return { icon: faCircleExclamation, tone: 'text-error-fg' };
}

function StageRow({
  label,
  stage,
  s,
}: {
  label: string;
  stage: NetworkTestStage;
  s: SettingsStrings;
}) {
  const { icon, tone } = stageVisual(stage.status);
  // The pass/fail/skip state is always spelled out in text, next to the icon — never colour alone
  // (the same WCAG discipline this phase already applies to its route-badge shields).
  const word =
    stage.status === 'pass'
      ? s.network.test.stagePass
      : stage.status === 'skipped'
        ? s.network.test.stageSkipped
        : s.network.test.stageFailed;

  return (
    <li>
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={icon} className={cn('h-4 w-4 shrink-0', tone)} aria-hidden />
        <span className="text-text-primary">{label}</span>
        <span className={cn('text-xs font-medium', tone)}>{word}</span>
      </div>
      {stage.status === 'fail' && (
        // Never the raw provider message as the primary text — the same rule the connections overview
        // and health card follow for `lastError`. The raw detail stays one hover away for a bug report.
        <p className="ml-6 mt-0.5 text-xs text-error-fg" title={stage.detail ?? undefined}>
          {s.network.connError[classifyNetworkError(stage.detail)]}
        </p>
      )}
      {stage.status === 'skipped' && (
        <p className="ml-6 mt-0.5 text-xs text-text-disabled">
          {s.network.test.stageSkippedDetail}
        </p>
      )}
    </li>
  );
}

export function ConnectionTestAction({ c, s }: { c: NetworkConnectionView; s: SettingsStrings }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (): void => {
    setRunning(true);
    setError(null);
    setResult(null);
    void window.tepegoz.testNetworkConnection(c.id).then(
      (raw) => {
        setRunning(false);
        const parsed = parseConnectionTestResult(raw);
        if (parsed === null) {
          setError(s.network.test.unreadable);
          return;
        }
        setResult(parsed);
      },
      (err: unknown) => {
        setRunning(false);
        // Already the localized, boundary-mapped sentence (never raw internal text) — the IPC layer
        // maps every thrown AppError through `mainStrings().errors` before it reaches the renderer.
        setError(err instanceof Error ? err.message : String(err));
      },
    );
  };

  return (
    <div>
      <Button size="sm" variant="outline" disabled={running} onClick={run}>
        {running ? s.network.test.running : s.network.test.run}
      </Button>

      {error !== null && <p className="mt-1 text-xs text-error-fg">{error}</p>}

      {result !== null && (
        <div className="mt-2 rounded-md border border-border px-3 py-2">
          <p className="mb-1.5 text-xs font-medium text-text-secondary">
            {s.network.test.resultTitle}
          </p>
          <ul className="space-y-1.5">
            <StageRow label={s.network.test.stageConfig} stage={result.configParse} s={s} />
            <StageRow label={s.network.test.stageHandshake} stage={result.handshake} s={s} />
          </ul>
          <p className="ml-6 mt-1.5 text-xs text-text-secondary">
            {`${s.network.test.stageReachability} — ${
              result.reachability === 'unverified'
                ? s.network.test.reachabilityUnverified
                : s.network.test.reachabilityNotReached
            }`}
          </p>
        </div>
      )}
    </div>
  );
}
