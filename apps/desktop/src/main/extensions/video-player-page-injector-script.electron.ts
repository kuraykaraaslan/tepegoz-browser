/**
 * The in-page bootstrap for the Unified Player, injected into the MAIN world (like translate/typo).
 * It is deliberately SEPARATE from the heavy player bundle: this small script detects eligible
 * `<video>` elements and, only when it finds one, asks the main process (over the CDP binding) to
 * inject `window.__tepegozVideoPlayer` — so pages with no video never pay for React. It then adopts
 * each video (suppressing native controls) and overlays the unified chrome via the bundle's mount API.
 *
 * Heuristics live here (not in the bundle) so they can be tuned without rebuilding kui-player.
 */
export const VIDEO_PLAYER_BOOTSTRAP = `
(() => {
  if (window.__tepegozVideoPlayerBootstrapInstalled === true) return;
  window.__tepegozVideoPlayerBootstrapInstalled = true;

  var MIN_W = 200, MIN_H = 120;
  var enabled = false;
  var options = null;
  var bundleRequested = false;
  var adopted = new Set();
  var attrObservers = new WeakMap();
  var domObserver = null;
  var scanTimer = 0;

  function origin() { try { return location.origin; } catch (e) { return null; } }

  // YouTube's own player attaches EME/Widevine MediaKeys (which the generic DRM guard below rejects)
  // and never exposes a plain <video controls> UI — it renders its own .ytp-* control bar instead.
  // Both need site-specific handling to skin it, so this check is used in a few places.
  function isYouTube() {
    try {
      var h = location.hostname;
      return h === 'youtube.com' || h.slice(-13) === '.youtube.com';
    } catch (e) { return false; }
  }

  function post() {
    try {
      if (typeof window.__tepegozVideoPlayerPost === 'function') {
        window.__tepegozVideoPlayerPost(JSON.stringify({ adopted: adopted.size, url: location.href }));
      }
    } catch (e) { /* ignore */ }
  }

  function requestBundle() {
    if (bundleRequested || window.__tepegozVideoPlayer) return;
    bundleRequested = true;
    try {
      if (typeof window.__tepegozVideoPlayerPost === 'function') {
        window.__tepegozVideoPlayerPost(JSON.stringify({ needBundle: true, adopted: adopted.size, url: location.href }));
      }
    } catch (e) { /* ignore */ }
  }

  function isDrm(v) {
    // YouTube is skinned deliberately despite its DRM setup: the overlay never touches the media
    // pipeline (it only reads paused/currentTime/volume and drives playback via standard APIs).
    if (isYouTube()) return false;
    try { if (v.mediaKeys != null) return true; } catch (e) { /* ignore */ }
    return v.getAttribute('data-tepegoz-drm') === '1';
  }

  function eligible(v) {
    if (!(v instanceof HTMLVideoElement)) return false;
    if (adopted.has(v)) return false;
    if (v.getAttribute('data-tepegoz-video-skip') === '1') return false;
    if (isDrm(v)) return false;
    var rects = v.getClientRects();
    if (rects.length === 0) return false;
    var style = getComputedStyle(v);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (v.offsetWidth < MIN_W || v.offsetHeight < MIN_H) return false;
    // Skip decorative background loops (muted+autoplay+loop, no controls, very short).
    if (v.loop && v.muted && v.autoplay && !v.controls && v.duration > 0 && v.duration < 30) return false;
    return true;
  }

  function watchControls(v) {
    if (attrObservers.has(v)) return;
    var obs = new MutationObserver(function () {
      if (adopted.has(v) && v.controls) v.controls = false;
    });
    obs.observe(v, { attributes: true, attributeFilter: ['controls'] });
    attrObservers.set(v, obs);
  }

  // A single page-level stylesheet drives (a) the per-site scale transform on adopted videos and
  // (b) hiding YouTube's own .ytp-* control bar. Using a real <style> (not inline styles) survives
  // YouTube's SPA re-writing the video's inline style on every render.
  function ensureStyleEl() {
    var style = document.getElementById('__tepegozVideoPlayerStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = '__tepegozVideoPlayerStyle';
      (document.head || document.documentElement).appendChild(style);
    }
    return style;
  }

  function updateStyle() {
    var css = '';
    if (adopted.size > 0 && options && typeof options.scale === 'number' && options.scale !== 1) {
      css += 'video[data-tepegoz-scaled]{transform:scale(' + options.scale + ') !important;transform-origin:center center;}';
    }
    if (adopted.size > 0 && isYouTube()) {
      css += '.ytp-chrome-bottom,.ytp-chrome-top,.ytp-gradient-bottom,.ytp-gradient-top,' +
        '.ytp-chrome-controls,.ytp-ce-element,.ytp-show-cards-title,.ytp-title{display:none !important;}';
    }
    ensureStyleEl().textContent = css;
  }

  function adopt(v) {
    if (!window.__tepegozVideoPlayer) { requestBundle(); return; }
    if (adopted.has(v)) return;
    try { v.controls = false; } catch (e) { /* ignore */ }
    if (!isYouTube()) {
      var onEncrypted = function () { release(v); };
      v.addEventListener('encrypted', onEncrypted, { once: true });
    }
    try {
      window.__tepegozVideoPlayer.mount(v, options || undefined);
      adopted.add(v);
      watchControls(v);
      v.setAttribute('data-tepegoz-scaled', '1');
    } catch (e) { /* ignore a single failed mount */ }
    updateStyle();
    post();
  }

  function release(v) {
    if (!adopted.has(v)) return;
    try { if (window.__tepegozVideoPlayer) window.__tepegozVideoPlayer.unmount(v); } catch (e) { /* ignore */ }
    var obs = attrObservers.get(v);
    if (obs) { obs.disconnect(); attrObservers.delete(v); }
    adopted.delete(v);
    try { v.removeAttribute('data-tepegoz-scaled'); } catch (e) { /* ignore */ }
    updateStyle();
    post();
  }

  function scan() {
    if (!enabled) return;
    // Drop videos that left the DOM.
    adopted.forEach(function (v) { if (!document.contains(v)) release(v); });
    var vids = document.querySelectorAll('video');
    var found = false;
    for (var i = 0; i < vids.length; i++) {
      if (eligible(vids[i])) { found = true; adopt(vids[i]); }
    }
    if (found && !window.__tepegozVideoPlayer) requestBundle();
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = window.setTimeout(function () { scanTimer = 0; scan(); }, 300);
  }

  function ensureObserver() {
    if (domObserver) return;
    domObserver = new MutationObserver(function () { scheduleScan(); });
    domObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.__tepegozVideoPlayerSetEnabled = function (next, opts) {
    enabled = next === true;
    if (opts) options = opts;
    if (enabled) { ensureObserver(); scan(); }
    else { adopted.forEach(function (v) { release(v); }); }
    return window.__tepegozVideoPlayerState();
  };

  window.__tepegozVideoPlayerApplyOptions = function (opts) {
    options = opts || options;
    if (window.__tepegozVideoPlayer) {
      // Re-mount adopted videos so new speed/theme/keyboard/scale options take effect.
      var current = Array.prototype.slice.call(adopted);
      current.forEach(function (v) { release(v); });
      current.forEach(function (v) { adopt(v); });
    }
    return window.__tepegozVideoPlayerState();
  };

  // Called by the main process right after it injects the heavy bundle.
  window.__tepegozVideoPlayerRescan = function () { bundleRequested = false; scan(); return window.__tepegozVideoPlayerState(); };

  window.__tepegozVideoPlayerState = function () {
    return { url: location.href, origin: origin(), adopted: adopted.size, updatedAt: Date.now() };
  };
})();
`;
