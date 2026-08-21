import { describe, expect, it } from 'vitest';
import type { Predicate, Step } from '@tepegoz/shared-types';
import {
  appendStepToContainer,
  deleteStepAtLocation,
  insertStepAfterLocation,
  moveStepAtLocation,
  updateStepAtLocation,
} from './macro-step-tree';

const cond: Predicate = { kind: 'textPresent', text: 'Ready' };

describe('macro step tree mutations', () => {
  it('appends steps inside a nested branch without touching sibling branches', () => {
    const steps: Step[] = [
      {
        kind: 'if',
        cond,
        then: [{ kind: 'waitMs', ms: 100 }],
        else: [{ kind: 'waitMs', ms: 200 }],
      },
    ];

    const next = appendStepToContainer(steps, [{ index: 0, slot: 'then' }], {
      kind: 'waitMs',
      ms: 300,
    });
    const block = next[0];

    expect(block?.kind).toBe('if');
    if (block?.kind !== 'if') return;
    expect(block.then).toEqual([
      { kind: 'waitMs', ms: 100 },
      { kind: 'waitMs', ms: 300 },
    ]);
    expect(block.else).toEqual([{ kind: 'waitMs', ms: 200 }]);
  });

  it('updates, inserts, moves, and deletes inside a nested loop body', () => {
    const steps: Step[] = [
      {
        kind: 'repeat',
        count: 2,
        body: [
          { kind: 'waitMs', ms: 100 },
          { kind: 'waitMs', ms: 200 },
        ],
      },
    ];
    const bodyPath = [{ index: 0, slot: 'body' as const }];
    const updated = updateStepAtLocation(steps, { containerPath: bodyPath, index: 0 }, () => ({
      kind: 'waitMs',
      ms: 150,
    }));
    const inserted = insertStepAfterLocation(
      updated,
      { containerPath: bodyPath, index: 0 },
      { kind: 'waitMs', ms: 175 },
    );
    const moved = moveStepAtLocation(inserted, { containerPath: bodyPath, index: 2 }, -1);
    const deleted = deleteStepAtLocation(moved, { containerPath: bodyPath, index: 0 });
    const block = deleted[0];

    expect(block?.kind).toBe('repeat');
    if (block?.kind !== 'repeat') return;
    expect(block.body).toEqual([
      { kind: 'waitMs', ms: 200 },
      { kind: 'waitMs', ms: 175 },
    ]);
  });
});
