import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPuzzlePiece } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@tepegoz/ui';
import { NAV_BTN } from '@tepegoz/nav-toolbar';
import type { Locale } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import type { ContentBounds, ExtensionId, ExtensionState } from '@tepegoz/desktop-ipc';
import { extensionsDict } from '@tepegoz/extensions-ui/i18n';
import { extensionLabel } from '../../../shared/extension-urls';
import { movePinned, pinnedOrder } from '../extensions/pinning';
import type { ExtensionDef } from '../extensions/registry';

/** Open-time height (px) for the Extensions panel; the popup measures its content and main trims the
 *  window down to fit (a `resizable:false` window can shrink but not grow — so start high). */
const PANEL_HEIGHT = 620;
/** Window (ms) to wait for a second click before firing the single-click action (icons with a
 *  double-click binding only). */
const DOUBLE_CLICK_MS = 220;

/**
 * A pinned extension icon. When the extension binds a double-click action, a single click is deferred
 * briefly to tell the two apart (Chrome-style); otherwise it fires immediately. Draggable, so the user
 * can reorder the pinned icons.
 */
function ExtensionIconButton({
  ext,
  label,
  active,
  onAction,
  onDragStart,
  onDrop,
}: {
  ext: ExtensionDef;
  label: string;
  active: boolean;
  onAction: (id: string, trigger: 'click' | 'doubleClick', anchor?: ContentBounds) => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const timer = useRef<number | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const hasDouble = ext.manifest.actions.doubleClick !== undefined;

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  function anchor(): ContentBounds | undefined {
    const el = btnRef.current;
    if (el === null) return undefined;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }

  function handleClick(): void {
    if (!hasDouble) {
      onAction(ext.id, 'click', anchor());
      return;
    }
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
      onAction(ext.id, 'doubleClick', anchor());
      return;
    }
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onAction(ext.id, 'click', anchor());
    }, DOUBLE_CLICK_MS);
  }

  return (
    <button
      ref={btnRef}
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => {
        e.preventDefault(); // mark this icon as a valid drop target
      }}
      onDrop={onDrop}
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault(); // native OS menu (Settings page / Unpin / Remove), acted on in main
        window.tepegoz.showExtensionContextMenu(ext.id);
      }}
      className={cn(NAV_BTN, active && 'bg-surface-overlay text-text-primary')}
    >
      {ext.icon}
    </button>
  );
}

interface ExtensionTrayProps {
  locale: Locale;
  /** Every enabled extension (the pinned subset is derived here). */
  extensions: readonly ExtensionDef[];
  /** Per-extension enabled/disabled state — a pinned-but-disabled extension shows no icon. */
  extensionStates: readonly ExtensionState[];
  /** Pinned extension ids, in toolbar order (`prefs.pinnedExtensions`). */
  pinnedIds: readonly ExtensionId[];
  /** The extension whose surface is currently open (for the pressed highlight), or null. */
  activeExtensionId: string | null;
  /** Fired when a toolbar icon is clicked / double-clicked; the host resolves it to a surface. */
  onExtensionAction: (id: string, trigger: 'click' | 'doubleClick', anchor?: ContentBounds) => void;
  /** Persist a new pinned order after a drag-reorder. */
  onReorderPinned: (ids: ExtensionId[]) => void;
}

/**
 * The pinned extension icons + the puzzle button — rendered in the nav bar's actions slot. Chrome's
 * model: only pinned extensions get an icon (nothing is pinned on a fresh profile), and the puzzle opens
 * the Extensions panel, a native popup window listing every enabled extension with a pin toggle.
 */
export function ExtensionTray({
  locale,
  extensions,
  extensionStates,
  pinnedIds,
  activeExtensionId,
  onExtensionAction,
  onReorderPinned,
}: ExtensionTrayProps) {
  const x = useT(extensionsDict);
  const puzzleRef = useRef<HTMLButtonElement>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const dragIdRef = useRef<ExtensionId | null>(null);
  const pinned = pinnedOrder(extensions, extensionStates, pinnedIds);

  useEffect(
    () =>
      window.tepegoz.onPopupClosed((surface) => {
        if (surface === 'extensions-panel') setPanelOpen(false);
      }),
    [],
  );

  function togglePanel(): void {
    const el = puzzleRef.current;
    if (el === null) return;
    if (panelOpen) {
      window.tepegoz.closePopup();
      setPanelOpen(false);
      return;
    }
    const r = el.getBoundingClientRect();
    window.tepegoz.openPopup(
      'extensions-panel',
      { x: r.x, y: r.y, width: r.width, height: r.height },
      { height: PANEL_HEIGHT },
    );
    setPanelOpen(true);
  }

  return (
    <>
      {pinned.map((ext) => (
        <ExtensionIconButton
          key={ext.id}
          ext={ext}
          label={extensionLabel(ext.manifest, locale).name}
          active={activeExtensionId === ext.id}
          onAction={onExtensionAction}
          onDragStart={() => {
            dragIdRef.current = ext.id;
          }}
          onDrop={() => {
            const dragged = dragIdRef.current;
            dragIdRef.current = null;
            if (dragged !== null) onReorderPinned(movePinned(pinnedIds, dragged, ext.id));
          }}
        />
      ))}
      {/* Puzzle: opens the Extensions panel (pin / run / manage), like Chrome's puzzle piece. */}
      <button
        ref={puzzleRef}
        type="button"
        aria-label={x.title}
        aria-haspopup="menu"
        aria-expanded={panelOpen}
        title={x.title}
        onClick={togglePanel}
        className={cn(NAV_BTN, panelOpen && 'bg-surface-overlay text-text-primary')}
      >
        <FontAwesomeIcon icon={faPuzzlePiece} className="h-4 w-4" aria-hidden />
      </button>
    </>
  );
}
