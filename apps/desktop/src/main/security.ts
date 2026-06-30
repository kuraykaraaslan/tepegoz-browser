import { app } from 'electron';

/**
 * Cross-surface hardening that must apply to EVERY web contents (app chrome AND browsed pages):
 * deny all permission requests by default (geolocation, notifications, media, …). Real permissions
 * go through HITL in a later phase.
 *
 * Surface-specific navigation policy is deliberately NOT global:
 *  - the app chrome window is locked to app content (deny-by-default) in `createWindow`;
 *  - browsing `WebContentsView`s must be free to navigate the web, with their own safe handlers in
 *    `TabManager` (open new windows as tabs, block non-web protocols).
 */
export function installSecurity(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false);
    });
  });
}
