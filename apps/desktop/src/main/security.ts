import { app } from 'electron';

/**
 * App-wide deny-by-default hardening (renderer = untrusted). Blocks navigation outside app content,
 * denies new windows, and denies all permission requests by default. The agent's browsed pages will
 * later live in their own isolated WebContentsView with their own (separate) policy — NOT here.
 */
export function installSecurity(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      const allowed = url.startsWith('file://') || url.startsWith('http://localhost');
      if (!allowed) {
        event.preventDefault();
      }
    });

    contents.setWindowOpenHandler(() => ({ action: 'deny' }));

    contents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false);
    });
  });
}
