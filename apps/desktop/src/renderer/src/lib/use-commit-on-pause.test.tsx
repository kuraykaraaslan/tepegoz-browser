// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useCommitOnPause } from './use-commit-on-pause';

/**
 * The deferral that stopped every settings keystroke from becoming an IPC round trip and a disk write.
 *
 * Three of these tests are about the failure a naive debounce would have introduced. Deferring a write
 * is only safe if the pending value cannot be lost — so unmounting (switching settings sections) must
 * flush, an explicit blur must flush, and an external update must not overwrite what someone is
 * halfway through typing. A debounce that drops the last edit is worse than no debounce at all.
 */

function Field({
  external,
  commit,
  delayMs,
}: {
  external: string;
  commit: (v: string) => void;
  delayMs?: number;
}) {
  const field = useCommitOnPause(external, commit, delayMs);
  return (
    <input
      aria-label="field"
      value={field.draft}
      onChange={(e) => {
        field.set(e.target.value);
      }}
      onBlur={field.flush}
    />
  );
}

/** `fireEvent.change` goes through React's own value tracker, which a direct `.value` assignment
 *  does not — assigning it would leave `onChange` silent and every assertion below vacuous. */
function type(value: string): void {
  act(() => {
    fireEvent.change(screen.getByLabelText('field'), { target: { value } });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useCommitOnPause', () => {
  it('writes once after the typing stops, not once per keystroke', () => {
    const commit = vi.fn();
    render(<Field external="" commit={commit} delayMs={500} />);

    type('h');
    type('ht');
    type('http');
    expect(commit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('http');
  });

  it('flushes on blur so leaving the field saves immediately', () => {
    const commit = vi.fn();
    render(<Field external="" commit={commit} delayMs={5000} />);

    type('done');
    act(() => {
      fireEvent.blur(screen.getByLabelText('field'));
    });

    expect(commit).toHaveBeenCalledWith('done');
  });

  it('flushes on unmount — switching sections must not drop a pending edit', () => {
    const commit = vi.fn();
    const view = render(<Field external="" commit={commit} delayMs={5000} />);

    type('half-typed');
    expect(commit).not.toHaveBeenCalled();

    view.unmount();
    expect(commit).toHaveBeenCalledWith('half-typed');
  });

  it('does not commit twice when the timer fires after a blur already flushed', () => {
    const commit = vi.fn();
    render(<Field external="" commit={commit} delayMs={200} />);

    type('once');
    act(() => {
      fireEvent.blur(screen.getByLabelText('field'));
      vi.advanceTimersByTime(1000);
    });

    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('adopts an external change while idle', () => {
    const commit = vi.fn();
    const view = render(<Field external="first" commit={commit} />);
    expect(screen.getByLabelText<HTMLInputElement>('field').value).toBe('first');

    view.rerender(<Field external="second" commit={commit} />);
    expect(screen.getByLabelText<HTMLInputElement>('field').value).toBe('second');
  });

  it('does NOT let an external change overwrite what is being typed', () => {
    const commit = vi.fn();
    const view = render(<Field external="first" commit={commit} delayMs={5000} />);

    type('mine');
    // Another window writes the same preference mid-edit. Adopting it here would yank the caret and
    // discard the user's in-progress value.
    view.rerender(<Field external="theirs" commit={commit} delayMs={5000} />);

    expect(screen.getByLabelText<HTMLInputElement>('field').value).toBe('mine');
  });
});
