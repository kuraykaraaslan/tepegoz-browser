# @tepegoz/ext-tasks

The **Scheduled Tasks** extension — one internal page at `tepegoz://com.tepegoz.tasks` that manages
agent conversations saved as recurring tasks: run a saved chat on a schedule or when a page changes,
and see its run history and artifacts in one place. It sits "on top of" `@tepegoz/ext-agent` — it
reads agent conversations to seed a new task — without importing its runtime, and the store/scheduler
live in `@tepegoz/tasks`. No bridge coupling: the page receives its host `api` as a prop, bound by
the renderer's surface-loader.

## Exports

- **`tasksManifest`** — the extension manifest (`com.tepegoz.tasks`, `page` surface, no permissions).
- **`TasksPage`** — the page component: task table, create/edit modal, conversation picker, run
  history.
- **`tasksDict` / `TasksStrings`** — this extension's own `en`/`tr` dictionary (ADR-0016,
  parity-tested).
- **`TasksHostApi`** (type) — the host contract the page is written against: `listTasks` /
  `getTask` / `saveTask` / `deleteTask`, `runTaskNow` / `cancelTaskRun`, `setTaskEnabled`,
  `listTaskRuns` / `listTaskArtifacts`, `onTasksState` subscription, plus `listAgentConversations` /
  `getAgentConversation` (to seed a task from an existing chat) and `createTab`.

The pure page logic — rows, schedule summaries, form-state ↔ `TaskSaveInput` mapping — is in
`tasks-page-model.ts` (React-free, unit-tested), mirroring the "thin component + tested model" split
used elsewhere in the app.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
