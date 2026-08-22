/**
 * jsdom implements no layout engine, so the DOM methods that move or measure things are simply absent.
 * Any component that keeps a highlighted row visible, or measures itself to position a portal, calls
 * one of them and throws in a test that never asked about scrolling.
 *
 * Stubbed here rather than guarded inside the components: scrolling a focused option into view is real
 * behaviour on a real screen, and a `typeof x === 'function'` check in production code to satisfy a
 * test environment is the tail wagging the dog. Called explicitly at the top of a test file — not as an
 * import side effect — so `grep stubJsdomLayout` finds every file that depends on it.
 *
 * `scrollIntoView` is a no-op: nothing here asserts on scroll position, and jsdom has no viewport to
 * scroll within. Add to this only what a component genuinely calls.
 */
export function stubJsdomLayout(): void {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    /* jsdom has no layout; nothing to scroll */
  };
}
