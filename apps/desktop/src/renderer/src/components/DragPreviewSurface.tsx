/**
 * The floating tab tear-off preview. Rendered in a small, transparent, click-through, always-on-top
 * window (see `createDragPreviewWindow`) that the main process sizes to the real tab's measured size and
 * moves to follow the cursor while a tab/group is dragged out of its strip. It reads its label + favicon
 * + appearance (active/pinned/group color) from the URL query, so it needs no IPC and paints instantly;
 * the theme is applied from the query (main.tsx) so its surface colors match the strip exactly. The chip
 * mirrors the real tab: rounded-top tab shape, active vs inactive surface, group-color accent, favicon +
 * title — sized to fill the (tab-sized) window edge-to-edge.
 */

/** Group palette accent (the `-400` shade of each Chrome-style group color) — mirrors GROUP_COLORS. */
const GROUP_ACCENT: Record<string, string> = {
  grey: '#94a3b8',
  blue: '#60a5fa',
  red: '#f87171',
  yellow: '#facc15',
  green: '#4ade80',
  pink: '#f472b6',
  purple: '#c084fc',
  cyan: '#22d3ee',
  orange: '#fb923c',
};

/** Neutral globe fallback (matches the tab's faGlobe) when a page declares no favicon. */
function GlobeIcon(): JSX.Element {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden style={{ flexShrink: 0, opacity: 0.55 }}>
      <g fill="none" stroke="currentColor" strokeWidth={1.2}>
        <circle cx={8} cy={8} r={6.2} />
        <ellipse cx={8} cy={8} rx={2.6} ry={6.2} />
        <path d="M2 8h12M3 5h10M3 11h10" />
      </g>
    </svg>
  );
}

export interface DragPreviewProps {
  title: string;
  faviconUrl: string | null;
  active: boolean;
  pinned: boolean;
  groupColor: string | null;
  kind: 'tab' | 'group';
}

export function DragPreviewSurface({
  title,
  faviconUrl,
  active,
  pinned,
  groupColor,
  kind,
}: Readonly<DragPreviewProps>): JSX.Element {
  const accent = groupColor !== null ? (GROUP_ACCENT[groupColor] ?? GROUP_ACCENT.grey) : null;

  // A group's header pill (its own colored pill, not a tab chip).
  if (kind === 'group') {
    return (
      <div
        style={{
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          height: '100%',
          padding: '0 10px',
          borderRadius: 6,
          background: accent ?? GROUP_ACCENT.grey,
          color: '#0b1220',
          font: '600 12px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          userSelect: 'none',
          cursor: 'grabbing',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: pinned ? 'center' : 'flex-start',
        gap: 6,
        width: '100%',
        height: '100%',
        padding: pinned ? '0 6px' : '0 10px',
        // Tab shape: rounded top, square bottom (merges into the content in the strip).
        borderRadius: '6px 6px 0 0',
        background: active ? 'var(--surface-base)' : 'var(--surface-overlay)',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        // Ungrouped → a subtle token border; grouped → the group color on the edges.
        border: accent !== null ? `1.5px solid ${accent}` : '1px solid var(--border)',
        borderBottom: accent !== null ? `2px solid ${accent}` : '1px solid var(--border)',
        font: '12px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        userSelect: 'none',
        cursor: 'grabbing',
      }}
    >
      {faviconUrl !== null && faviconUrl.length > 0 ? (
        <img
          src={faviconUrl}
          alt=""
          width={16}
          height={16}
          style={{ flexShrink: 0, borderRadius: 3, objectFit: 'contain' }}
          draggable={false}
        />
      ) : (
        <GlobeIcon />
      )}
      {!pinned && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>}
    </div>
  );
}
