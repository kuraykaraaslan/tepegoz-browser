// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { ImageAdjustDialog, type ImageAdjustDialogProps } from './image-adjust-dialog';

/**
 * Framing the new-tab background image: how it is sized, where its focal point sits, and how far it
 * is zoomed.
 *
 * The load-bearing behaviour is that DRAGGING is live locally and commits once, on release. A
 * per-move commit would put a preference write (and a disk round trip) on every pointer event of a
 * drag. The focal point is also grab-and-pan, not push: dragging right reveals the LEFT of the
 * image, the way moving a photo under a mask does.
 */

const DATA_URL = 'data:image/png;base64,AA';

function renderDialog(over: Partial<ImageAdjustDialogProps> = {}) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  render(
    <I18nProvider locale="en">
      <ImageAdjustDialog
        imageDataUrl={DATA_URL}
        fit="cover"
        positionX={50}
        positionY={50}
        zoom={1}
        onChange={onChange}
        onClose={onClose}
        {...over}
      />
    </I18nProvider>,
  );
  return { onChange, onClose };
}

const dialog = (): HTMLElement => screen.getByRole('dialog', { name: 'Adjust image' });

/** The draggable preview: the `touch-none` box that carries the pointer handlers. */
function preview(): HTMLElement {
  const el = dialog().querySelector('.touch-none');
  if (!(el instanceof HTMLElement)) throw new Error('preview not found');
  return el;
}

/** "Center" is both a fit and a position label, so the fit row has to be addressed on its own. */
function fitButton(label: string): HTMLElement {
  const heading = within(dialog()).getByText('Fit', { selector: 'p' });
  const row = heading.parentElement;
  return within(row as HTMLElement).getByRole('button', { name: label });
}

/**
 * jsdom implements neither pointer capture nor `PointerEvent`, and it measures every box as zero.
 * A `fireEvent.pointerDown(el, { clientX })` therefore arrives with NO coordinates — the drag maths
 * would read NaN and the test would pass or fail for reasons that have nothing to do with the code.
 * So: give the preview a real rect, stub the capture calls, and dispatch MouseEvents under the
 * pointer type names, which is what actually carries clientX/clientY through React.
 */
function stubPointerCapture(el: HTMLElement): void {
  Object.assign(el, {
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  });
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 }) as DOMRect;
}

function pointer(el: HTMLElement, type: string, clientX = 0, clientY = 0): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  fireEvent(el, event);
}

afterEach(cleanup);

describe('choosing a fit', () => {
  it('offers every fit and reports the one clicked', () => {
    const { onChange } = renderDialog();
    for (const [label, fit] of [
      ['Cover', 'cover'],
      ['Fit', 'contain'],
      ['Fill', 'fill'],
      ['Center', 'center'],
      ['Tile', 'tile'],
    ] as const) {
      fireEvent.click(fitButton(label));
      expect(onChange, label).toHaveBeenCalledWith({ imageFit: fit });
    }
  });
});

describe('the 3x3 alignment grid', () => {
  it('marks the preset matching the current focal point', () => {
    renderDialog({ positionX: 0, positionY: 0 });
    expect(screen.getByRole('button', { name: 'Top left' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    // the position "Center" is the one carrying aria-pressed; the fit of the same name does not
    const centre = screen
      .getAllByRole('button', { name: 'Center' })
      .find((b) => b.getAttribute('aria-pressed') !== null);
    expect(centre?.getAttribute('aria-pressed')).toBe('false');
  });

  it('sends both coordinates for the preset clicked', () => {
    const { onChange } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Bottom right' }));
    expect(onChange).toHaveBeenCalledWith({ imagePositionX: 100, imagePositionY: 100 });
  });

  it('marks no preset while the focal point sits between them', () => {
    // A dragged focal point usually lands off the grid; lighting a preset there would claim an
    // alignment the image does not have.
    renderDialog({ positionX: 37, positionY: 62 });
    for (const name of ['Top left', 'Bottom right']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-pressed'), name).toBe('false');
    }
  });
});

describe('zoom', () => {
  it('shows the current zoom as a percentage and reports it as a factor', () => {
    const { onChange } = renderDialog({ zoom: 1.5 });
    expect(within(dialog()).getByText('150%')).toBeDefined();

    fireEvent.change(within(dialog()).getByRole('slider'), { target: { value: '220' } });
    expect(onChange).toHaveBeenCalledWith({ imageZoom: 2.2 });
  });
});

describe('dragging the preview', () => {
  it('commits once, on release, rather than on every pointer move', () => {
    // A per-move commit is a preference write and a disk round trip per pointer event.
    const { onChange } = renderDialog();
    const el = preview();
    stubPointerCapture(el);

    pointer(el, 'pointerdown', 100, 50);
    pointer(el, 'pointermove', 120, 50);
    pointer(el, 'pointermove', 140, 60);
    expect(onChange).not.toHaveBeenCalled();

    pointer(el, 'pointerup');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('pans the image the way a photo moves under a mask: dragging right reveals its left', () => {
    const { onChange } = renderDialog({ positionX: 50, positionY: 50 });
    const el = preview();
    stubPointerCapture(el);

    // +40px over a 200px-wide preview is 20% of the width, so the focal x moves 50 → 30
    pointer(el, 'pointerdown', 100, 50);
    pointer(el, 'pointermove', 140, 50);
    pointer(el, 'pointerup');

    expect(onChange).toHaveBeenCalledWith({ imagePositionX: 30, imagePositionY: 50 });
  });

  it('clamps the focal point to the image rather than letting it run off the edge', () => {
    const { onChange } = renderDialog({ positionX: 10, positionY: 90 });
    const el = preview();
    stubPointerCapture(el);

    pointer(el, 'pointerdown', 100, 50);
    pointer(el, 'pointermove', 400, -400);
    pointer(el, 'pointerup');

    expect(onChange).toHaveBeenCalledWith({ imagePositionX: 0, imagePositionY: 100 });
  });

  it('ignores a move that never began with a press', () => {
    const { onChange } = renderDialog();
    const el = preview();
    stubPointerCapture(el);

    pointer(el, 'pointermove', 140, 50);
    pointer(el, 'pointerup');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not start a drag when there is no image to frame', () => {
    const { onChange } = renderDialog({ imageDataUrl: undefined });
    const box = dialog().querySelector('div[class*="cursor"]') ?? dialog();
    pointer(box as HTMLElement, 'pointerdown', 10, 10);
    pointer(box as HTMLElement, 'pointermove', 90, 10);
    pointer(box as HTMLElement, 'pointerup');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('closing', () => {
  it('closes on the Done button, on Escape, and on a click outside the dialog', () => {
    const { onClose } = renderDialog();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(dialog().parentElement!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does NOT close on a click inside the dialog', () => {
    // The backdrop closes on click, and the dialog sits inside it — without the stop, adjusting
    // anything would dismiss the thing being adjusted.
    const { onClose } = renderDialog();
    fireEvent.click(dialog());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores other keys, and stops listening once it is gone', () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(window, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();

    cleanup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
