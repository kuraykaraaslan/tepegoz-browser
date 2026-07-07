import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { useT } from '@tepegoz/i18n/react';
import { NEWTAB_IMAGE_FITS, type NewTabBackground, type NewTabImageFit } from '@tepegoz/desktop-ipc';
import { newtabDict } from './i18n';
import { imageBackgroundStyle } from './backgrounds';

export interface ImageAdjustDialogProps {
  /** The uploaded image resolved to a data URL (the live preview source). */
  imageDataUrl?: string | undefined;
  fit: NewTabImageFit;
  positionX: number;
  positionY: number;
  zoom: number;
  /** Apply a partial background change (host persists it). */
  onChange: (patch: Partial<NewTabBackground>) => void;
  onClose: () => void;
}

/** The 3×3 quick-alignment presets → focal x/y percentages. */
const POSITION_PRESETS = [
  { id: 'top-left', x: 0, y: 0 },
  { id: 'top', x: 50, y: 0 },
  { id: 'top-right', x: 100, y: 0 },
  { id: 'left', x: 0, y: 50 },
  { id: 'center', x: 50, y: 50 },
  { id: 'right', x: 100, y: 50 },
  { id: 'bottom-left', x: 0, y: 100 },
  { id: 'bottom', x: 50, y: 100 },
  { id: 'bottom-right', x: 100, y: 100 },
] as const;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * A modal for framing the uploaded background image — pick how it's sized (cover / fit / fill / center /
 * tile), drag the preview to set the focal point, and zoom. The preview uses the exact CSS the page
 * paints with. Dragging updates a live local focal point and commits on release (no per-move persist).
 */
export function ImageAdjustDialog({
  imageDataUrl,
  fit,
  positionX,
  positionY,
  zoom,
  onChange,
  onClose,
}: Readonly<ImageAdjustDialogProps>) {
  const t = useT(newtabDict).customize;
  // Live local focal point + zoom (so drag/slider feel instant); position commits on drag release.
  const [local, setLocal] = useState({ x: positionX, y: positionY, zoom });
  const localRef = useRef(local);
  const dragRef = useRef<{ cx: number; cy: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const next = { x: positionX, y: positionY, zoom };
    localRef.current = next;
    setLocal(next);
  }, [positionX, positionY, zoom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setLive = (next: { x: number; y: number; zoom: number }): void => {
    localRef.current = next;
    setLocal(next);
  };

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>): void {
    if (imageDataUrl === undefined) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { cx: e.clientX, cy: e.clientY, x: localRef.current.x, y: localRef.current.y };
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>): void {
    const d = dragRef.current;
    if (d === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // Grab-and-pan: dragging right reveals the LEFT of the image (focal x decreases), and so on.
    const nx = clamp(d.x - ((e.clientX - d.cx) / rect.width) * 100, 0, 100);
    const ny = clamp(d.y - ((e.clientY - d.cy) / rect.height) * 100, 0, 100);
    setLive({ ...localRef.current, x: nx, y: ny });
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>): void {
    if (dragRef.current === null) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    onChange({
      imagePositionX: Math.round(localRef.current.x),
      imagePositionY: Math.round(localRef.current.y),
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={t.adjustImage}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-surface-base p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">{t.adjustImage}</h2>
          <button
            type="button"
            onClick={onClose}
            title={t.done}
            aria-label={t.done}
            className="rounded-full p-1.5 text-text-secondary hover:bg-surface-raised hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        {/* Live preview — same CSS the page uses. Drag to reposition; checkerboard shows contain gaps. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="group relative h-44 w-full touch-none overflow-hidden rounded-lg border border-border"
          style={{
            cursor: imageDataUrl !== undefined ? 'move' : 'default',
            backgroundColor: 'var(--color-surface-system)',
            backgroundImage:
              'linear-gradient(45deg, rgba(127,127,127,0.15) 25%, transparent 25%, transparent 75%, rgba(127,127,127,0.15) 75%), linear-gradient(45deg, rgba(127,127,127,0.15) 25%, transparent 25%, transparent 75%, rgba(127,127,127,0.15) 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 8px 8px',
          }}
        >
          {imageDataUrl !== undefined && (
            <>
              <div
                className="h-full w-full"
                style={imageBackgroundStyle(imageDataUrl, fit, local.x, local.y, local.zoom)}
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/40 py-1 text-center text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                {t.dragHint}
              </span>
            </>
          )}
        </div>

        {/* Fit. */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-text-secondary">{t.fit}</p>
          <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
            {NEWTAB_IMAGE_FITS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={fit === f}
                onClick={() => onChange({ imageFit: f })}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  fit === f
                    ? 'bg-surface-raised text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t.fits[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Zoom. */}
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-xs font-medium text-text-secondary">
            {t.zoom}
            <span className="tabular-nums">{Math.round(local.zoom * 100)}%</span>
          </span>
          <input
            type="range"
            min={100}
            max={400}
            step={5}
            value={Math.round(local.zoom * 100)}
            onChange={(e) => {
              const z = Number(e.target.value) / 100;
              setLive({ ...localRef.current, zoom: z });
              onChange({ imageZoom: z });
            }}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-overlay accent-primary"
          />
        </label>

        {/* Position — a 3×3 alignment grid (quick presets; drag the preview for fine control). */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-text-secondary">{t.position}</p>
          <div className="grid w-24 grid-cols-3 gap-1">
            {POSITION_PRESETS.map((p) => {
              const active = Math.round(local.x) === p.x && Math.round(local.y) === p.y;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-label={t.positions[p.id]}
                  aria-pressed={active}
                  title={t.positions[p.id]}
                  onClick={() => onChange({ imagePositionX: p.x, imagePositionY: p.y })}
                  className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                    active ? 'border-border-focus bg-surface-raised' : 'border-border hover:bg-surface-raised'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${active ? 'bg-primary' : 'bg-text-secondary/40'}`}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
