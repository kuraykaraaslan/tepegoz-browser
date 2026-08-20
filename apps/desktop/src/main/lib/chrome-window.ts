import type { BrowserWindow } from 'electron';

/**
 * The top-level chrome window that owns `win`. Popup surfaces (the main menu, the Extensions panel, a
 * bookmark dropdown) are frameless CHILD windows of the browser window, so a push meant for the browser
 * UI — "run this extension's action", "the pinned list changed" — must climb the parent chain first;
 * sending it to the popup would land in a renderer that has none of the chrome's state (and is about to
 * close). Returns `win` itself when it is already top-level.
 */
export function chromeWindowFor(win: BrowserWindow): BrowserWindow {
  let owner = win;
  let parent = owner.getParentWindow();
  while (parent !== null && !parent.isDestroyed()) {
    owner = parent;
    parent = owner.getParentWindow();
  }
  return owner;
}
