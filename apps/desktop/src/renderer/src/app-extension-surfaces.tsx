import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Modal } from '@tepegoz/ui';
import type { ContentBounds, TabGroupSettingValue } from '@tepegoz/desktop-ipc';
import type { Locale } from '@tepegoz/i18n';
import { extensionLabel, extensionPageUrl } from '../../shared/extension-urls';
import { extensionDefById, type ExtensionDef } from './extensions/registry';
import { AGENT_EXTENSION_ID, AGENT_PANEL_OPEN_KEY, nextAgentDock } from './agent-dock';

/** The overlay surface kinds (everything except `page`, which opens as its own internal tab). */
export type OverlaySurfaceKind = 'popup' | 'modal' | 'panel';
export interface ActiveSurface {
  id: string;
  kind: OverlaySurfaceKind;
}

export { AGENT_EXTENSION_ID, AGENT_PANEL_OPEN_KEY } from './agent-dock';

/** Sidebar dock width bounds (px); the user drags the edge to resize between these. */
const SIDEBAR_MIN_WIDTH = 280;
const SIDEBAR_MAX_WIDTH = 640;
const SIDEBAR_DEFAULT_WIDTH = 360;

/** Fallback anchor for a popup opened without an icon rect (e.g. from the hamburger menu): the
 *  top-right of the content, just under the chrome. */
function defaultPopupAnchor(): ContentBounds {
  return { x: window.innerWidth - 8, y: 84, width: 0, height: 0 };
}

export interface ExtensionSurfacesResult {
  activeSurface: ActiveSurface | null;
  sidebarExtId: string | null;
  popupOpenId: string | null;
  sidebarWidth: number;
  resizingSidebar: boolean;
  resizeSnapshot: string | null;
  closeSurface: () => void;
  closeSidebar: () => void;
  runExtensionAction: (
    id: string,
    trigger: 'click' | 'doubleClick',
    anchor?: ContentBounds,
  ) => void;
  onSidebarResizeStart: (e: ReactPointerEvent) => void;
  renderActiveSurface: () => ReactNode;
  renderSidebar: () => ReactNode;
}

/**
 * Extension overlay surfaces (popup/modal/panel), the resizable sidebar dock, and the Agent Console's
 * per-tab-group open/closed persistence. Split out of `App.tsx` (ADR-0010 250-line cap).
 */
export function useExtensionSurfaces(
  registry: ExtensionDef[],
  activeGroupId: string | null,
  activeGroupAgentPanelOpen: TabGroupSettingValue | undefined,
  locale: Locale,
  sidebarResizeLabel: string,
  surfaceFallback: ReactNode,
  /** Another overlay (e.g. the bookmarks "open all" confirmation) that also hides the web view. */
  overlayAlsoOpen: boolean,
): ExtensionSurfacesResult {
  const [activeSurface, setActiveSurface] = useState<ActiveSurface | null>(null);
  // The extension docked in the resizable sidebar (persists across tab switches, Chrome-style), or null.
  const [sidebarExtId, setSidebarExtId] = useState<string | null>(null);
  // Mirrors `sidebarExtId` for the toggle/close callbacks (they must read the CURRENT dock without
  // taking a stale closure, and without doing IPC inside a state updater).
  const sidebarExtIdRef = useRef<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [resizingSidebar, setResizingSidebar] = useState(false);
  // A still PNG of the page shown in place of the (briefly hidden) live web view during a resize drag,
  // so the page never blanks to the chrome background. Null when not dragging / no capturable page.
  const [resizeSnapshot, setResizeSnapshot] = useState<string | null>(null);
  const draggingSidebarRef = useRef(false);
  // The extension whose native popup window is open (for the toolbar-icon pressed state), or null.
  const [popupOpenId, setPopupOpenId] = useState<string | null>(null);
  const popupOpenIdRef = useRef<string | null>(null);

  // Follow the active tab's group: restore that group's own Agent Console state, and close the panel
  // on an ungrouped tab (no group → no agent session → an open-but-inert panel). The rule itself lives
  // in `nextAgentDock` so it is unit-tested.
  useEffect(() => {
    setSidebarExtId((cur) => nextAgentDock(cur, activeGroupId, activeGroupAgentPanelOpen));
  }, [activeGroupId, activeGroupAgentPanelOpen]);

  const closeSurface = useCallback(() => {
    setActiveSurface(null);
  }, []);

  /**
   * Persist the Agent Console's open/closed state on the active tab group, so a later switch back
   * restores exactly what the user left. An ungrouped tab has no group to remember it on: opening
   * ensures one first (the same group the panel's own session keys on, so the two never disagree);
   * closing has nothing to record and nothing to restore.
   */
  const rememberAgentPanelOpen = useCallback(
    (open: boolean): void => {
      if (activeGroupId !== null) {
        window.tepegoz.updateTabGroup(activeGroupId, {
          settings: { [AGENT_PANEL_OPEN_KEY]: open },
        });
        return;
      }
      if (!open) return;
      void window.tepegoz.ensureActiveGroup().then(
        (gid) => {
          window.tepegoz.updateTabGroup(gid, { settings: { [AGENT_PANEL_OPEN_KEY]: true } });
        },
        () => {
          /* no active tab — nothing to remember it on */
        },
      );
    },
    [activeGroupId],
  );

  // The panel's own close button (and the "extension was disabled" path). An explicit close is a
  // decision worth remembering, or the next group switch would bring the panel straight back.
  const closeSidebar = useCallback(() => {
    if (sidebarExtIdRef.current === AGENT_EXTENSION_ID) rememberAgentPanelOpen(false);
    setSidebarExtId(null);
  }, [rememberAgentPanelOpen]);

  // Resolve a toolbar icon click/double-click (or a menu request) to its bound surface. `anchor` is the
  // clicked icon's rect (for popups); absent for menu-triggered actions.
  const runExtensionAction = useCallback(
    (id: string, trigger: 'click' | 'doubleClick', anchor?: ContentBounds) => {
      const def = extensionDefById(registry, id);
      if (def === undefined) return;
      const action =
        trigger === 'click' ? def.manifest.actions.click : def.manifest.actions.doubleClick;
      if (action === undefined) return;
      if (action === 'page') {
        setActiveSurface(null);
        window.tepegoz.navigateTab(extensionPageUrl(id)); // opens/focuses the extension's internal tab
        return;
      }
      if (action === 'sidebar') {
        // A dock beside the page (web view stays visible); toggles on re-trigger. For the Agent Console
        // specifically, also remember the resulting open/closed state on the active tab group, so
        // switching groups later restores each one's own state (TabGroupSettingKey standard).
        const next = sidebarExtIdRef.current === id ? null : id;
        setSidebarExtId(next);
        if (id === AGENT_EXTENSION_ID) rememberAgentPanelOpen(next === id);
        return;
      }
      if (action === 'popup') {
        // A native floating window that keeps the page live behind it. Re-triggering toggles it off.
        if (popupOpenIdRef.current === id) {
          window.tepegoz.closePopup();
          setPopupOpenId(null);
        } else {
          window.tepegoz.openPopup('ext', anchor ?? defaultPopupAnchor(), { id });
          setPopupOpenId(id);
        }
        return;
      }
      // Remaining overlay surfaces (modal/panel) hide the web view. Toggle: re-triggering closes it.
      setActiveSurface((cur) =>
        cur !== null && cur.id === id && cur.kind === action ? null : { id, kind: action },
      );
    },
    [registry, rememberAgentPanelOpen],
  );

  // Drag the sidebar's inner edge to resize (clamped). The native web view swallows pointer events when
  // the cursor crosses over it, so we briefly hide it and let the chrome capture the drag — but we show
  // a still snapshot of the page in its place first, so it never blanks to the chrome background.
  function onSidebarResizeStart(e: ReactPointerEvent): void {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    draggingSidebarRef.current = true;
    const onMove = (ev: PointerEvent): void => {
      const next = startWidth + (startX - ev.clientX); // drag left → wider
      setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, next)));
    };
    const onUp = (): void => {
      draggingSidebarRef.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setResizingSidebar(false);
      setResizeSnapshot(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    // Capture the page FIRST, then hide the live view — no navy flash. If the drag already ended (fast
    // click) or there's nothing to capture, we still hide so the drag tracks reliably.
    window.tepegoz
      .captureActiveTab()
      .then((snap) => {
        if (!draggingSidebarRef.current) return;
        setResizeSnapshot(snap);
        setResizingSidebar(true);
      })
      .catch(() => {
        if (draggingSidebarRef.current) setResizingSidebar(true);
      });
  }

  // Overlay surfaces (popup/modal/panel) are chrome-rendered and hide the active web view while open.
  // A sidebar resize also hides it momentarily so the chrome captures the drag's pointer stream (the
  // native web view otherwise swallows pointer events once the cursor crosses over it).
  useEffect(() => {
    const overlayOpen = activeSurface !== null || overlayAlsoOpen;
    window.tepegoz.setContentVisible(!overlayOpen && !resizingSidebar);
  }, [activeSurface, overlayAlsoOpen, resizingSidebar]);

  // Escape closes the open overlay surface (the Modal also self-handles Escape — both are idempotent).
  useEffect(() => {
    if (activeSurface === null) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setActiveSurface(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [activeSurface]);

  // The native menu's Extensions submenu asks the chrome to open an extension (its click surface).
  useEffect(() => {
    return window.tepegoz.onOpenExtension((id) => {
      runExtensionAction(id, 'click');
    });
  }, [runExtensionAction]);

  // Keep the docked-sidebar ref in sync (read by runExtensionAction/closeSidebar).
  useEffect(() => {
    sidebarExtIdRef.current = sidebarExtId;
  }, [sidebarExtId]);

  // Keep the popup-open ref in sync (read by runExtensionAction to toggle without stale closures).
  useEffect(() => {
    popupOpenIdRef.current = popupOpenId;
  }, [popupOpenId]);

  // The native popup closed itself (click-away / Escape / its Close button) — clear the pressed state.
  useEffect(() => {
    return window.tepegoz.onPopupClosed((surface) => {
      if (surface.startsWith('ext:')) setPopupOpenId(null);
    });
  }, []);

  /** Render the open overlay surface, wrapped per its kind (panel = full overlay, modal = centered
   *  dialog, popup = anchored card under the toolbar icons). */
  function renderActiveSurface(): ReactNode {
    if (activeSurface === null) return null;
    const def = extensionDefById(registry, activeSurface.id);
    const Surface = def?.surfaces[activeSurface.kind];
    if (def === undefined || Surface === undefined) return null;
    const body = (
      <Suspense fallback={surfaceFallback}>
        <Surface onClose={closeSurface} />
      </Suspense>
    );
    if (activeSurface.kind === 'panel') return body;
    if (activeSurface.kind === 'modal') {
      return (
        <Modal open onClose={closeSurface} ariaLabel={extensionLabel(def.manifest, locale).name}>
          {body}
        </Modal>
      );
    }
    return null; // popup opens as a native window (openPopup), not a DOM overlay
  }

  const sidebarDef = sidebarExtId !== null ? extensionDefById(registry, sidebarExtId) : undefined;
  const SidebarSurface = sidebarDef?.surfaces.sidebar;

  /** Render the resizable sidebar dock (right), if an extension is docked. The page/web view stays
   *  visible beside it — its bounds already exclude this strip because `contentRef` measures only the
   *  left region. */
  function renderSidebar(): ReactNode {
    if (sidebarDef === undefined || SidebarSurface === undefined) return null;
    return (
      <aside
        style={{ width: sidebarWidth }}
        className="relative flex shrink-0 border-l border-border bg-surface-base"
        aria-label={extensionLabel(sidebarDef.manifest, locale).name}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={sidebarResizeLabel}
          onPointerDown={onSidebarResizeStart}
          className="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-border-focus"
        />
        <div className="relative flex-1 overflow-hidden">
          <Suspense fallback={surfaceFallback}>
            <SidebarSurface onClose={closeSidebar} />
          </Suspense>
        </div>
      </aside>
    );
  }

  return {
    activeSurface,
    sidebarExtId,
    popupOpenId,
    sidebarWidth,
    resizingSidebar,
    resizeSnapshot,
    closeSurface,
    closeSidebar,
    runExtensionAction,
    onSidebarResizeStart,
    renderActiveSurface,
    renderSidebar,
  };
}
