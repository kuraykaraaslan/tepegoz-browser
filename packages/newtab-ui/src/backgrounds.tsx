import { useId, type CSSProperties } from 'react';
import type { NewTabBackground, NewTabImageFit } from '@tepegoz/desktop-ipc';

/**
 * New-tab background presets + the layer that paints them. A background is either the theme surface
 * (`kind: 'default'`), a solid color optionally overlaid with one of the SVG patterns below
 * (`kind: 'color'`), or an uploaded image (`kind: 'image'`). The patterns are inline `<svg><pattern>`
 * components — no asset files — tinted from the chosen color so a color + pattern composites as one.
 */

/** A background value resolved for rendering: the stored descriptor plus the fetched image data URL. */
export type ResolvedNewTabBackground = NewTabBackground & { imageDataUrl?: string | undefined };

/** Muted, dark preset colors offered as one-tap swatches (mirrors the Settings theme presets). */
export const NEWTAB_COLOR_PRESETS = [
  '#1e293b',
  '#0d7377',
  '#334155',
  '#3f3f46',
  '#4c1d95',
  '#7f1d1d',
  '#78350f',
  '#14532d',
] as const;

/** Relative luminance (0..1) of a #rgb / #rrggbb color; ~0 for black, ~1 for white. */
function relLuma(hex: string): number {
  const h = hex.replace('#', '');
  const n =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A subtle pattern "ink" that contrasts the base color: light ink on dark colors, dark on light. */
function patternInk(color: string, alpha = 0.16): string {
  try {
    return relLuma(color) < 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
  } catch {
    return `rgba(255,255,255,${alpha})`;
  }
}

type PatternProps = { color: string };

/** A full-bleed `<svg>` that tiles `children` (a `<pattern>` body) at `size`px via userSpaceOnUse. */
function Tiled({ size, children }: { size: number; children: (id: string) => JSX.Element }) {
  const id = useId();
  return (
    <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse">
          {children(id)}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

function DotsPattern({ color }: PatternProps) {
  const ink = patternInk(color, 0.22);
  return <Tiled size={24}>{() => <circle cx={3} cy={3} r={2} fill={ink} />}</Tiled>;
}

function GridPattern({ color }: PatternProps) {
  const ink = patternInk(color);
  return (
    <Tiled size={32}>
      {() => <path d="M32 0H0V32" fill="none" stroke={ink} strokeWidth={1} />}
    </Tiled>
  );
}

function DiagonalPattern({ color }: PatternProps) {
  const ink = patternInk(color);
  return (
    <Tiled size={18}>
      {() => (
        <path
          d="M-4 4 L4 -4 M0 18 L18 0 M14 22 L22 14"
          stroke={ink}
          strokeWidth={1.5}
          fill="none"
        />
      )}
    </Tiled>
  );
}

function WavesPattern({ color }: PatternProps) {
  const ink = patternInk(color);
  return (
    <Tiled size={40}>
      {() => (
        <path
          d="M0 15 Q10 5 20 15 T40 15 M0 30 Q10 20 20 30 T40 30"
          fill="none"
          stroke={ink}
          strokeWidth={1.5}
        />
      )}
    </Tiled>
  );
}

function HexagonsPattern({ color }: PatternProps) {
  const ink = patternInk(color, 0.14);
  return (
    <Tiled size={28}>
      {() => (
        <path
          d="M14 1 L27 8.5 L27 20.5 L14 28 L1 20.5 L1 8.5 Z"
          fill="none"
          stroke={ink}
          strokeWidth={1.25}
        />
      )}
    </Tiled>
  );
}

function TopographyPattern({ color }: PatternProps) {
  const ink = patternInk(color, 0.13);
  return (
    <Tiled size={60}>
      {() => (
        <g fill="none" stroke={ink} strokeWidth={1.25}>
          <circle cx={30} cy={30} r={6} />
          <circle cx={30} cy={30} r={14} />
          <circle cx={30} cy={30} r={22} />
          <circle cx={0} cy={0} r={14} />
          <circle cx={60} cy={60} r={14} />
        </g>
      )}
    </Tiled>
  );
}

/** The curated SVG pattern presets (single source shared by the page layer + the customize panel). */
export const NEWTAB_SVG_PRESETS = [
  { id: 'dots', Pattern: DotsPattern },
  { id: 'grid', Pattern: GridPattern },
  { id: 'diagonal', Pattern: DiagonalPattern },
  { id: 'waves', Pattern: WavesPattern },
  { id: 'hexagons', Pattern: HexagonsPattern },
  { id: 'topography', Pattern: TopographyPattern },
] as const satisfies readonly { id: string; Pattern: (props: PatternProps) => JSX.Element }[];

export type NewTabSvgPresetId = (typeof NEWTAB_SVG_PRESETS)[number]['id'];

/**
 * The CSS for painting an image background at a given fit, focal point (x/y %), and zoom — shared by the
 * page layer, the customize thumbnail, and the adjust preview so all three show the exact same framing.
 * Zoom is a `scale()` toward the focal point; the element MUST sit inside an `overflow-hidden` box.
 */
export function imageBackgroundStyle(
  dataUrl: string,
  fit: NewTabImageFit,
  x: number,
  y: number,
  zoom: number,
): CSSProperties {
  const base: CSSProperties = {
    backgroundImage: `url(${dataUrl})`,
    backgroundPosition: `${x}% ${y}%`,
    transform: zoom === 1 ? undefined : `scale(${zoom})`,
    transformOrigin: `${x}% ${y}%`,
  };
  switch (fit) {
    case 'cover':
      return { ...base, backgroundSize: 'cover', backgroundRepeat: 'no-repeat' };
    case 'contain':
      return { ...base, backgroundSize: 'contain', backgroundRepeat: 'no-repeat' };
    case 'fill':
      return { ...base, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' };
    case 'center':
      return { ...base, backgroundSize: 'auto', backgroundRepeat: 'no-repeat' };
    case 'tile':
      return { ...base, backgroundSize: 'auto', backgroundRepeat: 'repeat' };
  }
}

/**
 * The absolutely-positioned background layer painted behind the new-tab content. Renders nothing for
 * `kind: 'default'`. `opacity` fades the whole layer toward the theme surface beneath it.
 */
export function NewTabBackgroundLayer({ background }: { background: ResolvedNewTabBackground }) {
  const {
    kind,
    color,
    svgId,
    imageFit,
    imagePositionX,
    imagePositionY,
    imageZoom,
    opacity,
    imageDataUrl,
  } = background;
  if (kind === 'default') return null;
  const preset = NEWTAB_SVG_PRESETS.find((p) => p.id === svgId);
  const Pattern = preset?.Pattern;
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity }}
      aria-hidden
    >
      {kind === 'color' && (
        <>
          <div className="absolute inset-0" style={{ backgroundColor: color }} />
          {Pattern && (
            <div className="absolute inset-0">
              <Pattern color={color} />
            </div>
          )}
        </>
      )}
      {kind === 'image' && imageDataUrl !== undefined && (
        <div
          className="absolute inset-0"
          style={imageBackgroundStyle(
            imageDataUrl,
            imageFit,
            imagePositionX,
            imagePositionY,
            imageZoom,
          )}
        />
      )}
    </div>
  );
}
