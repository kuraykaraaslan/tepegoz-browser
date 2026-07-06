const controllers = new Map<string, AbortController>();

export function hasActiveAgentRun(): boolean {
  return controllers.size > 0;
}

export function registerAgentRunController(runId: string, controller: AbortController): void {
  controllers.set(runId, controller);
}

export function unregisterAgentRunController(runId: string): void {
  controllers.delete(runId);
}

export function agentRunController(runId: string): AbortController | undefined {
  return controllers.get(runId);
}

export function abortAllAgentRunControllers(): void {
  for (const controller of controllers.values()) controller.abort();
  controllers.clear();
}
