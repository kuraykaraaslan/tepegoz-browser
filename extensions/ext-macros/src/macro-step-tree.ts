import type { Step } from '@tepegoz/shared-types';

export type StepChildSlot = 'then' | 'else' | 'body';

export interface StepContainerSegment {
  index: number;
  slot: StepChildSlot;
}

export type StepContainerPath = readonly StepContainerSegment[];

export interface StepLocation {
  containerPath: StepContainerPath;
  index: number;
}

export function stepContainerKey(path: StepContainerPath): string {
  return path.map((segment) => `${segment.index}:${segment.slot}`).join('/');
}

export function stepLocationKey(location: StepLocation): string {
  const container = stepContainerKey(location.containerPath);
  return container.length === 0 ? String(location.index) : `${container}/${location.index}`;
}

export function childSteps(step: Step, slot: StepChildSlot): readonly Step[] {
  if (step.kind === 'if') {
    if (slot === 'then') return step.then;
    if (slot === 'else') return step.else ?? [];
  }
  if ((step.kind === 'repeat' || step.kind === 'forEachRow') && slot === 'body') return step.body;
  return [];
}

export function updateStepContainer(
  steps: readonly Step[],
  path: StepContainerPath,
  update: (container: Step[]) => Step[],
): Step[] {
  if (path.length === 0) return update([...steps]);
  const [head, ...tail] = path;
  if (head === undefined) return [...steps];
  return steps.map((step, index) => {
    if (index !== head.index) return step;
    return replaceChildSteps(step, head.slot, updateStepContainer(childSteps(step, head.slot), tail, update));
  });
}

export function updateStepAtLocation(
  steps: readonly Step[],
  location: StepLocation,
  update: (step: Step) => Step,
): Step[] {
  return updateStepContainer(steps, location.containerPath, (container) => {
    if (location.index < 0 || location.index >= container.length) return container;
    container[location.index] = update(container[location.index]!);
    return container;
  });
}

export function insertStepAfterLocation(
  steps: readonly Step[],
  location: StepLocation,
  step: Step,
): Step[] {
  return updateStepContainer(steps, location.containerPath, (container) => {
    container.splice(location.index + 1, 0, step);
    return container;
  });
}

export function appendStepToContainer(
  steps: readonly Step[],
  containerPath: StepContainerPath,
  step: Step,
): Step[] {
  return updateStepContainer(steps, containerPath, (container) => [...container, step]);
}

export function deleteStepAtLocation(steps: readonly Step[], location: StepLocation): Step[] {
  return updateStepContainer(steps, location.containerPath, (container) =>
    container.filter((_, index) => index !== location.index),
  );
}

export function moveStepAtLocation(
  steps: readonly Step[],
  location: StepLocation,
  direction: -1 | 1,
): Step[] {
  return updateStepContainer(steps, location.containerPath, (container) => {
    const nextIndex = location.index + direction;
    if (nextIndex < 0 || nextIndex >= container.length) return container;
    [container[location.index], container[nextIndex]] = [container[nextIndex]!, container[location.index]!];
    return container;
  });
}

function replaceChildSteps(step: Step, slot: StepChildSlot, next: Step[]): Step {
  if (step.kind === 'if') {
    if (slot === 'then') return { ...step, then: next };
    if (slot === 'else') return { ...step, else: next };
  }
  if (step.kind === 'repeat' && slot === 'body') return { ...step, body: next };
  if (step.kind === 'forEachRow' && slot === 'body') return { ...step, body: next };
  return step;
}
