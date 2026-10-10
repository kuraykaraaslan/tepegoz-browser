import { webFrame } from 'electron';

/**
 * The ONE preload a browsed page's frame is born with (ADR-0051): it defines
 * `navigator.globalPrivacyControl` as `true`, so a site that reads the property sees the same signal the
 * `Sec-GPC: 1` header already carries.
 *
 * It takes no input and produces no output, on purpose. There is no `ipcRenderer`, no `contextBridge`, no
 * read of anything — so there is no channel from an untrusted page to the main process and nothing here
 * for a hostile page to call. Whether it runs at all is decided by main registering or unregistering this
 * file when the setting changes (`network/gpc-preload.electron.ts`), never by the page asking.
 *
 * Main frame only: Electron runs a session preload in top-level documents, not in subframes or workers
 * (measured for the ADR). The header covers those requests; this covers the property.
 */
try {
  void webFrame.executeJavaScript(
    'Object.defineProperty(Navigator.prototype,"globalPrivacyControl",{get(){return true},configurable:true,enumerable:true});',
  );
} catch {
  // A frame that cannot run it simply does not get the property; the header is unaffected.
}
