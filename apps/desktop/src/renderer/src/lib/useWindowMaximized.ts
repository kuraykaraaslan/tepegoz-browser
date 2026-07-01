import { useEffect, useState } from 'react';

/**
 * App binding for `@tepegoz/window-controls`: tracks the window's maximized state via the preload
 * bridge (initial read + live subscription). Keeping the I/O here lets the package stay a pure view.
 */
export function useWindowMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const api = window.tepegoz;
    void api.isWindowMaximized().then(setMaximized).catch(() => undefined);
    return api.onWindowMaximizedChange(setMaximized);
  }, []);

  return maximized;
}
