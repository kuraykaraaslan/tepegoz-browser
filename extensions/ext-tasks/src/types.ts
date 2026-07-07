/**
 * The Scheduled Tasks page's host-facing contract (the slice of `window.tepegoz` it is written against).
 * The page never reaches the global bridge — it receives `api` as a prop (bound in the renderer's
 * surface-loader). It reads agent conversations (from the Agent extension) to seed new tasks, so this
 * surface sits "on top of" ext-agent without importing its runtime.
 */
import type {
  TaskArtifactRecord,
  TaskCommandInput,
  TaskDefinition,
  TaskRunRecord,
  TaskSaveInput,
  TasksState,
} from '@tepegoz/tasks';
import type {
  AgentConversationDetail,
  AgentConversationListInput,
  AgentConversationSummary,
} from '@tepegoz/ext-agent/history';

export interface TasksHostApi {
  listTasks(): Promise<TaskDefinition[]>;
  getTask(id: string): Promise<TaskDefinition | null>;
  saveTask(input: TaskSaveInput): Promise<TaskDefinition>;
  deleteTask(id: string): Promise<void>;
  runTaskNow(input: TaskCommandInput): Promise<void>;
  cancelTaskRun(input: TaskCommandInput): Promise<void>;
  setTaskEnabled(input: { id: string; enabled: boolean }): Promise<void>;
  listTaskRuns(taskId?: string): Promise<TaskRunRecord[]>;
  listTaskArtifacts(taskId?: string): Promise<TaskArtifactRecord[]>;
  onTasksState(callback: (state: TasksState) => void): () => void;
  /** Agent conversations, used to seed a new task from an existing chat. */
  listAgentConversations(input?: AgentConversationListInput): Promise<AgentConversationSummary[]>;
  getAgentConversation(id: string): Promise<AgentConversationDetail | null>;
  /** Open a URL in a new browser tab (e.g. jump to the source chat's history page). */
  createTab(url?: string): void;
}
