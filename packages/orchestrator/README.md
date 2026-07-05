# @tepegoz/orchestrator (L3)

The agent's **Planner + Executor + Reactor** loop: turns a user prompt into a DAG plan, runs it
step-by-step through the single `@tepegoz/capability-plane` ToolGateway PEP, and reacts to each step's
outcome to decide what happens next. Model calls are routed through `@tepegoz/model-gateway`, so this
package never talks to a vendor API directly. Sits below `@tepegoz/agent-runtime`, which supplies the
Electron/app-facing seams (browser host, journal, HITL, live events) this package's callers need.

## Exports
- **`Planner`** — `PlanRequest` in, produces the step DAG the Executor runs.
- **`Executor`** — runs a plan's steps sequentially through the ToolGateway PEP; `RunOptions` in,
  `RunResult`/`StepOutcome`/`StopReason` out.
- **`Reactor`** — `parseDecision` + `react()`: given a step's outcome, decides the next action
  (continue/retry/replan/stop); `ReactRequest`/`ReactOptions`/`ReactResult`/`Decision` types.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
