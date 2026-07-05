import { useEffect, useState } from 'react';

interface CursorPos {
  x: number;
  y: number;
  visible: boolean;
}

/**
 * Renders a visible arrow cursor that tracks simulated mouse movements during macro/agent runs.
 * Mounted at the App root; `position:fixed` maps shell-window-relative CDP coordinates directly.
 * `pointer-events:none` — never intercepts real user interaction.
 */
export function CursorOverlay() {
  const [pos, setPos] = useState<CursorPos>({ x: 0, y: 0, visible: false });

  useEffect(() => {
    return window.tepegoz.onCursorPosition(setPos);
  }, []);

  if (!pos.visible) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: 24,
        height: 24,
        pointerEvents: 'none',
        zIndex: 9999,
        transform: 'translate(-2px, -2px)',
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        {/* Standard arrow pointer shape */}
        <path
          d="M 4 2 L 4 18 L 8 14 L 11 21 L 13 20 L 10 13 L 16 13 Z"
          fill="white"
          stroke="black"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
