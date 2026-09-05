// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { DragPreviewSurface } from './DragPreviewSurface';

/**
 * The floating tab tear-off preview — a small transparent always-on-top window main sizes/positions to
 * follow the cursor while dragging a tab or group out of the strip. Purely presentational: it reads its
 * look from props alone (URL query params, decoded upstream by `main.tsx`), so this just pins every
 * branch — the group pill vs. the tab chip, pinned/active/favicon-fallback, and the group-color accent
 * (including its fallback for an unrecognized color id).
 */

afterEach(cleanup);

describe('DragPreviewSurface', () => {
  it('renders a colored group pill with the title for kind "group"', () => {
    const { container } = render(
      <DragPreviewSurface
        title="My Group"
        faviconUrl={null}
        active={false}
        pinned={false}
        groupColor="blue"
        kind="group"
      />,
    );
    const pill = container.firstElementChild as HTMLElement;
    expect(pill.textContent).toBe('My Group');
    expect(pill.style.background).toBe('rgb(96, 165, 250)'); // GROUP_ACCENT.blue
  });

  it('falls back to the grey accent for a group with no color at all', () => {
    const { container } = render(
      <DragPreviewSurface
        title="No color"
        faviconUrl={null}
        active={false}
        pinned={false}
        groupColor={null}
        kind="group"
      />,
    );
    const pill = container.firstElementChild as HTMLElement;
    expect(pill.style.background).toBe('rgb(148, 163, 184)'); // GROUP_ACCENT.grey
  });

  it('falls back to the grey accent for an unrecognized group color', () => {
    const { container } = render(
      <DragPreviewSurface
        title="Odd"
        faviconUrl={null}
        active={false}
        pinned={false}
        groupColor="magenta"
        kind="group"
      />,
    );
    const pill = container.firstElementChild as HTMLElement;
    expect(pill.style.background).toBe('rgb(148, 163, 184)'); // GROUP_ACCENT.grey
  });

  it('renders an ungrouped tab chip with a token border and no color accent', () => {
    const { container } = render(
      <DragPreviewSurface
        title="A Tab"
        faviconUrl={null}
        active={false}
        pinned={false}
        groupColor={null}
        kind="tab"
      />,
    );
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.style.borderBottom).toBe('1px solid var(--border)');
  });

  it('renders a grouped tab chip with the group-color border', () => {
    const { container } = render(
      <DragPreviewSurface
        title="A Tab"
        faviconUrl={null}
        active={false}
        pinned={false}
        groupColor="red"
        kind="tab"
      />,
    );
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.style.borderTop).toBe('1.5px solid rgb(248, 113, 113)'); // GROUP_ACCENT.red
    expect(chip.style.borderBottom).toBe('2px solid rgb(248, 113, 113)');
  });

  it('shows the favicon image when one is provided', () => {
    const { container } = render(
      <DragPreviewSurface
        title="A Tab"
        faviconUrl="https://example.com/favicon.ico"
        active={true}
        pinned={false}
        groupColor={null}
        kind="tab"
      />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/favicon.ico');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('falls back to the globe icon when the favicon is null or empty', () => {
    const { container: withNull } = render(
      <DragPreviewSurface
        title="A Tab"
        faviconUrl={null}
        active={true}
        pinned={false}
        groupColor={null}
        kind="tab"
      />,
    );
    expect(withNull.querySelector('svg')).toBeTruthy();
    expect(withNull.querySelector('img')).toBeNull();
    cleanup();

    const { container: withEmpty } = render(
      <DragPreviewSurface
        title="A Tab"
        faviconUrl=""
        active={true}
        pinned={false}
        groupColor={null}
        kind="tab"
      />,
    );
    expect(withEmpty.querySelector('svg')).toBeTruthy();
    expect(withEmpty.querySelector('img')).toBeNull();
  });

  it('hides the title and centers content for a pinned tab', () => {
    const { container } = render(
      <DragPreviewSurface
        title="Hidden title"
        faviconUrl={null}
        active={false}
        pinned={true}
        groupColor={null}
        kind="tab"
      />,
    );
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.textContent).toBe('');
    expect(chip.style.justifyContent).toBe('center');
  });

  it('shows the title for an unpinned tab', () => {
    const { container } = render(
      <DragPreviewSurface
        title="Visible title"
        faviconUrl={null}
        active={false}
        pinned={false}
        groupColor={null}
        kind="tab"
      />,
    );
    expect(container.textContent).toBe('Visible title');
  });

  it('uses the active vs. inactive surface tokens', () => {
    const { container: activeC } = render(
      <DragPreviewSurface
        title="A"
        faviconUrl={null}
        active={true}
        pinned={false}
        groupColor={null}
        kind="tab"
      />,
    );
    expect((activeC.firstElementChild as HTMLElement).style.background).toBe('var(--surface-base)');
    cleanup();

    const { container: inactiveC } = render(
      <DragPreviewSurface
        title="A"
        faviconUrl={null}
        active={false}
        pinned={false}
        groupColor={null}
        kind="tab"
      />,
    );
    expect((inactiveC.firstElementChild as HTMLElement).style.background).toBe(
      'var(--surface-overlay)',
    );
  });
});
