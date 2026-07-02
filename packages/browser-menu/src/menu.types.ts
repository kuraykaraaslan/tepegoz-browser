import type { ReactNode } from 'react';

/** A single icon button inside an `actions` row (grouped, 3–4 per row to keep the menu short). */
export interface MenuAction {
  id: string;
  /** Accessible name + tooltip (the full label). */
  label: string;
  /** Optional short caption shown under the icon (the full `label` stays the tooltip/aria-name). */
  caption?: string;
  icon: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/**
 * The generic menu item model consumed by `<Menu>`. Deliberately app-agnostic so the same component
 * backs the main (hamburger) menu and any other menu surface. Content labels are injected by the
 * caller (they mix strings owned by several packages); the component only lays them out.
 */
export type MenuItem =
  | {
      kind?: 'item';
      id: string;
      label: string;
      icon?: ReactNode;
      /** Right-aligned accelerator hint (e.g. "Ctrl+T"). Display-only. */
      shortcut?: string;
      onSelect?: () => void;
      danger?: boolean;
      /** Greyed, non-interactive placeholder — skipped by keyboard navigation. */
      disabled?: boolean;
      /** Trailing adornment (rendered after the shortcut). */
      trailing?: ReactNode;
      /** Marks this row as a submenu parent: shows a chevron + `aria-haspopup`, and on hover/focus the
       *  host is notified via `<Menu onFlyoutOpen>` with this row's `id` + screen rect so it can open the
       *  submenu however it likes (the app opens a separate native window to the left — a native popup
       *  window can't overflow its own bounds, so an in-window flyout isn't an option). */
      flyout?: boolean;
    }
  | { kind: 'separator' }
  /** A non-interactive section title (e.g. "Other profiles"). */
  | { kind: 'label'; id: string; text: string }
  /** A row of grouped icon-only buttons (3–4), used to compact secondary actions. */
  | { kind: 'actions'; id: string; items: MenuAction[] }
  /** A non-interactive header block (e.g. the Chrome profile row); `content` is rendered verbatim. */
  | { kind: 'header'; id: string; content: ReactNode }
  /** An inline zoom control row (− value + ). Zoom control aria-labels come from this package's dict. */
  | {
      kind: 'zoom';
      id: string;
      label: string;
      value: number;
      onZoomOut?: () => void;
      onZoomIn?: () => void;
      onReset?: () => void;
      disabled?: boolean;
    };
