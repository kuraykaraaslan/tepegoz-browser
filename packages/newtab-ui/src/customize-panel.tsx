import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faImage, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useT } from '@tepegoz/i18n/react';
import type { NewTabBackground, NewTabBackgroundKind } from '@tepegoz/desktop-ipc';
import { newtabDict } from './i18n';
import {
  NEWTAB_COLOR_PRESETS,
  NEWTAB_SVG_PRESETS,
  imageBackgroundStyle,
  type ResolvedNewTabBackground,
} from './backgrounds';
import { ImageAdjustDialog } from './image-adjust-dialog';

const FALLBACK_COLOR = NEWTAB_COLOR_PRESETS[0];

export interface CustomizePanelProps {
  background: ResolvedNewTabBackground;
  /** Apply a partial change to the background (host persists it). */
  onChange: (patch: Partial<NewTabBackground>) => void;
  /** Open the native image picker; resolves to the stored ref (host caches the data URL) or null. */
  onPickImage: () => Promise<{ ref: string; dataUrl: string } | null>;
  onClose: () => void;
}

/**
 * The inline "Customize" panel over the new-tab page (Chrome-style). Picks a background — default theme
 * surface, a solid color (optionally + an SVG pattern), or an uploaded image — and a dimness level.
 * Presentational: every change is reported via `onChange`; the host owns persistence.
 */
export function CustomizePanel({ background, onChange, onPickImage, onClose }: Readonly<CustomizePanelProps>) {
  const t = useT(newtabDict).customize;
  const color = background.color || FALLBACK_COLOR;
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function selectKind(kind: NewTabBackgroundKind): void {
    if (kind === 'color') onChange({ kind, color });
    else onChange({ kind });
  }

  const types: readonly { kind: NewTabBackgroundKind; label: string }[] = [
    { kind: 'default', label: t.default },
    { kind: 'color', label: t.color },
    { kind: 'image', label: t.image },
  ];

  return (
    <div
      role="dialog"
      aria-label={t.title}
      className="absolute bottom-16 right-4 z-40 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-4 rounded-2xl border border-border bg-surface-base p-4 shadow-xl"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">{t.title}</h2>
        <button
          type="button"
          onClick={onClose}
          title={t.close}
          aria-label={t.close}
          className="rounded-full p-1.5 text-text-secondary hover:bg-surface-raised hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {/* Background type segmented control. */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-text-secondary">{t.type}</p>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {types.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              aria-pressed={background.kind === kind}
              onClick={() => selectKind(kind)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                background.kind === kind
                  ? 'bg-surface-raised text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {background.kind === 'color' && (
        <>
          {/* Color swatches + custom color. */}
          <div className="flex flex-wrap items-center gap-2">
            {NEWTAB_COLOR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-label={preset}
                aria-pressed={background.color.toLowerCase() === preset}
                onClick={() => onChange({ color: preset })}
                style={{ backgroundColor: preset }}
                className={`h-7 w-7 rounded-full border border-border transition-transform hover:scale-110 ${
                  background.color.toLowerCase() === preset
                    ? 'ring-2 ring-offset-2 ring-border-focus ring-offset-surface-base'
                    : ''
                }`}
              />
            ))}
            <label className="flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 text-xs text-text-primary">
              <span
                className="h-3.5 w-3.5 rounded-full border border-border"
                style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
                aria-hidden
              />
              {t.customColor}
              <input
                type="color"
                className="sr-only"
                value={color}
                onChange={(e) => onChange({ color: e.target.value })}
              />
            </label>
          </div>

          {/* SVG pattern picker (overlaid on the color). */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-text-secondary">{t.pattern}</p>
            <div className="grid grid-cols-4 gap-2">
              <PatternTile
                label={t.patternNone}
                color={color}
                active={background.svgId === ''}
                onClick={() => onChange({ svgId: '' })}
              />
              {NEWTAB_SVG_PRESETS.map((preset) => {
                const Pattern = preset.Pattern;
                return (
                  <PatternTile
                    key={preset.id}
                    label={t.patterns[preset.id]}
                    color={color}
                    active={background.svgId === preset.id}
                    onClick={() => onChange({ svgId: preset.id })}
                  >
                    <Pattern color={color} />
                  </PatternTile>
                );
              })}
            </div>
          </div>
        </>
      )}

      {background.kind === 'image' && (
        <div className="flex flex-col gap-2">
          {background.imageDataUrl !== undefined && (
            <button
              type="button"
              onClick={() => setAdjusting(true)}
              title={t.adjustHint}
              aria-label={t.adjustImage}
              className="group relative h-24 w-full overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              <span
                className="absolute inset-0"
                style={imageBackgroundStyle(
                  background.imageDataUrl,
                  background.imageFit,
                  background.imagePositionX,
                  background.imagePositionY,
                  background.imageZoom,
                )}
              />
              <span className="absolute inset-x-0 bottom-0 bg-black/50 py-1 text-center text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                {t.adjustHint}
              </span>
            </button>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                void onPickImage().then((r) => {
                  if (r !== null) onChange({ kind: 'image', imageRef: r.ref });
                });
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              <FontAwesomeIcon icon={faImage} className="h-3.5 w-3.5" aria-hidden />
              {background.imageRef === '' ? t.uploadImage : t.changeImage}
            </button>
            {background.imageRef !== '' && (
              <button
                type="button"
                onClick={() => onChange({ kind: 'default', imageRef: '' })}
                title={t.removeImage}
                aria-label={t.removeImage}
                className="rounded-lg border border-border px-3 py-2 text-error hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Dimness (background-layer opacity). */}
      {background.kind !== 'default' && (
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-xs font-medium text-text-secondary">
            {t.dimness}
            <span className="tabular-nums">{Math.round(background.opacity * 100)}%</span>
          </span>
          <input
            type="range"
            min={20}
            max={100}
            value={Math.round(background.opacity * 100)}
            onChange={(e) => onChange({ opacity: Number(e.target.value) / 100 })}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-overlay accent-primary"
          />
        </label>
      )}

      {adjusting && background.kind === 'image' && (
        <ImageAdjustDialog
          imageDataUrl={background.imageDataUrl}
          fit={background.imageFit}
          positionX={background.imagePositionX}
          positionY={background.imagePositionY}
          zoom={background.imageZoom}
          onChange={onChange}
          onClose={() => setAdjusting(false)}
        />
      )}
    </div>
  );
}

/** A pattern preview swatch: the current color with the pattern overlaid, plus a label. */
function PatternTile({
  label,
  color,
  active,
  onClick,
  children,
}: Readonly<{
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="flex flex-col items-center gap-1 focus-visible:outline-none"
    >
      <span
        className={`relative block h-9 w-full overflow-hidden rounded-md border ${
          active ? 'border-border-focus ring-2 ring-border-focus' : 'border-border'
        }`}
        style={{ backgroundColor: color }}
      >
        {children !== undefined && <span className="absolute inset-0">{children}</span>}
      </span>
      <span className="w-full truncate text-center text-[10px] text-text-secondary">{label}</span>
    </button>
  );
}
