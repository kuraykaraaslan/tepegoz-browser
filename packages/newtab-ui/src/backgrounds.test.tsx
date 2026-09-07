// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { NewTabImageFit } from '@tepegoz/desktop-ipc';
import {
  NEWTAB_COLOR_PRESETS,
  NEWTAB_SVG_PRESETS,
  NewTabBackgroundLayer,
  imageBackgroundStyle,
  type ResolvedNewTabBackground,
} from './backgrounds';

/**
 * The new-tab background layer and the CSS that frames an uploaded image.
 *
 * `imageBackgroundStyle` is shared by three surfaces — the page layer, the customize thumbnail, and
 * the adjust preview — so that what the user frames in the adjuster is exactly what the page paints.
 * If they ever disagree, the adjuster becomes a preview of something else.
 *
 * One branch stays uncovered: `patternInk`'s catch. `relLuma` parses a hex with `parseInt`, which
 * returns NaN rather than throwing for junk, and NaN < 0.5 is simply false — so the catch has nothing
 * to catch. It is a belt on an expression that does not throw.
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

afterEach(cleanup);

describe('the background layer', () => {
  it('paints nothing at all for the default background', () => {
    // "Default" means the theme surface shows through; an empty layer would still stack a div over
    // the page for no reason.
    const { container } = render(<NewTabBackgroundLayer background={background()} />);
    expect(container.firstChild).toBeNull();
  });

  it('paints a flat colour, and no pattern when none is chosen', () => {
    const { container } = render(
      <NewTabBackgroundLayer background={background({ kind: 'color', color: '#123456' })} />,
    );
    expect(container.querySelector('[style*="rgb(18, 52, 86)"]')).not.toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('overlays the chosen svg pattern on the colour', () => {
    const preset = NEWTAB_SVG_PRESETS[0];
    const { container } = render(
      <NewTabBackgroundLayer
        background={background({ kind: 'color', color: '#123456', svgId: preset.id })}
      />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('ignores an svg id it does not recognise instead of rendering nothing', () => {
    // Preset ids are persisted; one can outlive the preset that defined it.
    const { container } = render(
      <NewTabBackgroundLayer
        background={background({ kind: 'color', color: '#123456', svgId: 'retired-preset' })}
      />,
    );
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('[style*="rgb(18, 52, 86)"]')).not.toBeNull();
  });

  it('renders every shipped pattern for both a dark and a light base colour', () => {
    // The pattern ink flips with the base luminance — light ink on dark, dark on light — so a preset
    // that only ever rendered on one of the two could be invisible on the other.
    for (const preset of NEWTAB_SVG_PRESETS) {
      for (const color of ['#000000', '#ffffff']) {
        const { container, unmount } = render(
          <NewTabBackgroundLayer
            background={background({ kind: 'color', color, svgId: preset.id })}
          />,
        );
        expect(container.querySelector('svg'), `${preset.id} on ${color}`).not.toBeNull();
        unmount();
      }
    }
  });

  it('accepts a three-digit hex the same as a six-digit one', () => {
    const { container } = render(
      <NewTabBackgroundLayer
        background={background({ kind: 'color', color: '#abc', svgId: NEWTAB_SVG_PRESETS[0].id })}
      />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('paints an uploaded image once it has been resolved to data', () => {
    const { container } = render(
      <NewTabBackgroundLayer
        background={background({ kind: 'image', imageDataUrl: 'data:image/png;base64,AA' })}
      />,
    );
    expect(container.querySelector('[style*="data:image/png;base64,AA"]')).not.toBeNull();
  });

  it('paints no image while the upload is still being resolved', () => {
    // The descriptor names a stored ref; the data URL arrives after a round trip. Painting early
    // would flash an empty box over the page.
    const { container } = render(
      <NewTabBackgroundLayer background={background({ kind: 'image', imageRef: 'cas://x' })} />,
    );
    expect(container.querySelector('[style*="url("]')).toBeNull();
  });

  it('applies the opacity to the whole layer, so it fades toward the theme surface', () => {
    const { container } = render(
      <NewTabBackgroundLayer background={background({ kind: 'color', opacity: 0.4 })} />,
    );
    expect((container.firstChild as HTMLElement).style.opacity).toBe('0.4');
  });
});

describe('imageBackgroundStyle', () => {
  const style = (fit: NewTabImageFit, x = 50, y = 50, zoom = 1) =>
    imageBackgroundStyle('data:image/png;base64,AA', fit, x, y, zoom);

  it('gives each fit its own sizing and repeat', () => {
    expect(style('cover')).toMatchObject({
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
    });
    expect(style('contain')).toMatchObject({
      backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat',
    });
    expect(style('fill')).toMatchObject({
      backgroundSize: '100% 100%',
      backgroundRepeat: 'no-repeat',
    });
    expect(style('center')).toMatchObject({
      backgroundSize: 'auto',
      backgroundRepeat: 'no-repeat',
    });
    // tile is the only fit that repeats — that is what makes it a tile
    expect(style('tile')).toMatchObject({ backgroundSize: 'auto', backgroundRepeat: 'repeat' });
  });

  it('anchors the position AND the zoom origin to the same focal point', () => {
    // Zooming around a different point than the one being positioned would slide the image out from
    // under the framing the user just chose.
    const s = style('cover', 20, 80, 2);
    expect(s.backgroundPosition).toBe('20% 80%');
    expect(s.transformOrigin).toBe('20% 80%');
    expect(s.transform).toBe('scale(2)');
  });

  it('sets no transform at all at zoom 1', () => {
    // A `scale(1)` still creates a containing block and a compositing layer for nothing.
    expect(style('cover', 50, 50, 1).transform).toBeUndefined();
  });
});

describe('the shipped presets', () => {
  it('ships colour presets that are all valid hex', () => {
    expect(NEWTAB_COLOR_PRESETS.length).toBeGreaterThan(0);
    for (const color of NEWTAB_COLOR_PRESETS) {
      expect(color, color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('gives every svg preset a unique id', () => {
    // The id is what gets persisted; a duplicate would make one preset unreachable.
    const ids = NEWTAB_SVG_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
