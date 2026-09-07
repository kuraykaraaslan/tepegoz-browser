// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { CustomizePanel } from './customize-panel';
import { NEWTAB_COLOR_PRESETS, NEWTAB_SVG_PRESETS } from './backgrounds';
import type { ResolvedNewTabBackground } from './backgrounds';

/**
 * The new-tab "Customize" panel. It is presentational by contract: every change is reported through
 * `onChange` as a PARTIAL patch and the host owns persistence — so what these tests pin is which
 * patch each control emits, and which controls exist for each background kind.
 */

const background = (over: Partial<ResolvedNewTabBackground> = {}): ResolvedNewTabBackground => ({
  kind: 'default',
  color: '#1e293b',
  svgId: '',
  imageRef: '',
  imageFit: 'cover',
  imagePositionX: 50,
  imagePositionY: 50,
  imageZoom: 1,
  opacity: 1,
  ...over,
});

function renderPanel(over: Partial<ResolvedNewTabBackground> = {}) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  const onPickImage = vi.fn(() => Promise.resolve<{ ref: string; dataUrl: string } | null>(null));
  render(
    <I18nProvider locale="en">
      <CustomizePanel
        background={background(over)}
        onChange={onChange}
        onPickImage={onPickImage}
        onClose={onClose}
      />
    </I18nProvider>,
  );
  return { onChange, onClose, onPickImage };
}

afterEach(cleanup);

describe('choosing a background type', () => {
  it('marks the current type and offers the other two', () => {
    renderPanel({ kind: 'color' });
    expect(screen.getByRole('button', { name: 'Color' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Default' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('carries the current colour along when switching TO colour', () => {
    // Switching to "Color" with no colour in the patch would paint the fallback for an instant and
    // then jump — the panel already knows which colour is in force.
    const { onChange } = renderPanel({ kind: 'default', color: '#123456' });
    fireEvent.click(screen.getByRole('button', { name: 'Color' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'color', color: '#123456' });
  });

  it('substitutes a fallback colour when the stored one is empty', () => {
    const { onChange } = renderPanel({ kind: 'default', color: '' });
    fireEvent.click(screen.getByRole('button', { name: 'Color' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'color', color: expect.stringMatching(/^#/) as unknown }),
    );
  });

  it('sends only the kind for the other two types', () => {
    const { onChange } = renderPanel({ kind: 'color' });
    fireEvent.click(screen.getByRole('button', { name: 'Default' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'default' });

    fireEvent.click(screen.getByRole('button', { name: 'Image' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'image' });
  });
});

describe('the colour controls', () => {
  it('appear only for a colour background', () => {
    renderPanel({ kind: 'default' });
    expect(screen.queryByText('Pattern')).toBeNull();
    cleanup();
    renderPanel({ kind: 'color' });
    expect(screen.getByText('Pattern')).toBeDefined();
  });

  it('sends a preset swatch, and marks the one in force', () => {
    const preset = NEWTAB_COLOR_PRESETS[1];
    const { onChange } = renderPanel({ kind: 'color', color: preset });
    expect(screen.getByRole('button', { name: preset }).getAttribute('aria-pressed')).toBe('true');

    const other = NEWTAB_COLOR_PRESETS[2];
    fireEvent.click(screen.getByRole('button', { name: other }));
    expect(onChange).toHaveBeenCalledWith({ color: other });
  });

  it('matches the active swatch case-insensitively, since a stored colour may be upper case', () => {
    const preset = NEWTAB_COLOR_PRESETS[0];
    renderPanel({ kind: 'color', color: preset.toUpperCase() });
    expect(screen.getByRole('button', { name: preset }).getAttribute('aria-pressed')).toBe('true');
  });

  it('sends a hand-picked colour from the picker', () => {
    const { onChange } = renderPanel({ kind: 'color' });
    const picker = document.querySelector('input[type="color"]');
    fireEvent.change(picker!, { target: { value: '#abcdef' } });
    expect(onChange).toHaveBeenCalledWith({ color: '#abcdef' });
  });

  it('offers a tile per pattern plus a None tile, and sends the id of the one clicked', () => {
    const { onChange } = renderPanel({ kind: 'color', svgId: NEWTAB_SVG_PRESETS[0].id });
    expect(screen.getByRole('button', { name: 'None' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(onChange).toHaveBeenCalledWith({ svgId: '' });

    const second = NEWTAB_SVG_PRESETS[1];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(second.id, 'i') }));
    expect(onChange).toHaveBeenCalledWith({ svgId: second.id });
  });
});

describe('the image controls', () => {
  it('appear only for an image background', () => {
    renderPanel({ kind: 'color' });
    expect(screen.queryByRole('button', { name: 'Upload image' })).toBeNull();
    cleanup();
    renderPanel({ kind: 'image' });
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeDefined();
  });

  it('says "Change image" once one is stored, and offers to remove it', () => {
    renderPanel({ kind: 'image', imageRef: 'cas://x' });
    expect(screen.getByRole('button', { name: 'Change image' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Remove image' })).toBeDefined();
  });

  it('offers no remove button when there is nothing stored to remove', () => {
    renderPanel({ kind: 'image', imageRef: '' });
    expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull();
  });

  it('stores the ref the picker returns', async () => {
    const onChange = vi.fn();
    const onPickImage = vi.fn(() =>
      Promise.resolve<{ ref: string; dataUrl: string } | null>({
        ref: 'cas://new',
        dataUrl: 'data:image/png;base64,AA',
      }),
    );
    render(
      <I18nProvider locale="en">
        <CustomizePanel
          background={background({ kind: 'image' })}
          onChange={onChange}
          onPickImage={onPickImage}
          onClose={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Upload image' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ kind: 'image', imageRef: 'cas://new' }),
    );
  });

  it('changes nothing when the picker is cancelled', async () => {
    // Cancelling a file dialog is not a request to clear the background that is already set.
    const { onChange, onPickImage } = renderPanel({ kind: 'image', imageRef: 'cas://x' });
    fireEvent.click(screen.getByRole('button', { name: 'Change image' }));
    await waitFor(() => expect(onPickImage).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removing the image falls back to the default background, not to an empty image one', () => {
    // An "image" background with no image is a blank page with no way back to a colour.
    const { onChange } = renderPanel({ kind: 'image', imageRef: 'cas://x' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'default', imageRef: '' });
  });

  it('offers the adjust thumbnail only once the image data has resolved', () => {
    renderPanel({ kind: 'image', imageRef: 'cas://x' });
    expect(screen.queryByRole('button', { name: 'Adjust image' })).toBeNull();
    cleanup();

    renderPanel({ kind: 'image', imageRef: 'cas://x', imageDataUrl: 'data:image/png;base64,AA' });
    expect(screen.getByRole('button', { name: 'Adjust image' })).toBeDefined();
  });

  it('opens the adjust dialog from the thumbnail, and closes it again', () => {
    renderPanel({ kind: 'image', imageRef: 'cas://x', imageDataUrl: 'data:image/png;base64,AA' });
    fireEvent.click(screen.getByRole('button', { name: 'Adjust image' }));
    const dialog = screen.getByRole('dialog', { name: 'Adjust image' });
    expect(dialog).toBeDefined();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'Adjust image' })).toBeNull();
  });
});

describe('dimness', () => {
  it('is offered for a colour or image background but not for the default one', () => {
    // There is nothing to dim toward when the theme surface IS the background.
    renderPanel({ kind: 'default' });
    expect(screen.queryByText('Dimness')).toBeNull();
    cleanup();
    renderPanel({ kind: 'color' });
    expect(screen.getByText('Dimness')).toBeDefined();
  });

  it('shows the current value as a percentage and reports the change as a fraction', () => {
    const { onChange } = renderPanel({ kind: 'color', opacity: 0.6 });
    expect(screen.getByText('60%')).toBeDefined();

    fireEvent.change(screen.getByRole('slider'), { target: { value: '40' } });
    expect(onChange).toHaveBeenCalledWith({ opacity: 0.4 });
  });
});

describe('closing the panel', () => {
  it('closes on the close button', () => {
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape from anywhere on the page', () => {
    const { onClose } = renderPanel();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('ignores other keys, and stops listening once it is gone', () => {
    const { onClose } = renderPanel();
    fireEvent.keyDown(window, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();

    cleanup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
