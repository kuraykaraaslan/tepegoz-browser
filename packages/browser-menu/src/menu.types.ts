import type { ReactNode } from 'react';

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
      /** Trailing adornment (e.g. a submenu chevron), rendered after the shortcut. */
      trailing?: ReactNode;
    }
  | { kind: 'separator' }
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
