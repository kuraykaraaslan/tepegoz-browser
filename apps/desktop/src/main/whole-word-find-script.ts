/**
 * The whole-word DOM matcher script — the additive path for "Match whole word" (phase-2c). Injected
 * into an ISOLATED WORLD via `WebContents.executeJavaScriptInIsolatedWorld` (the same mechanism
 * `extraction-sandbox.electron.ts` uses; unlike the perception script's CDP-attached world, this needs
 * no debugger attach). The regex SOURCE/FLAGS are computed once in Node
 * (`whole-word-pattern.ts#buildWholeWordPattern`, unit-tested there) and interpolated here as JSON
 * literals — this file never builds a pattern from a raw string itself, so there is exactly one place
 * that does the escaping.
 *
 * State (the current match set + the active index) lives on `window[NS]` INSIDE the isolated world: a
 * different world's `window` is a distinct global object for JS purposes even though it shares the
 * page's DOM, so the page's own script can neither see nor tamper with it. It persists across calls on
 * the same world/frame (until a navigation tears the whole context down), which is what lets `step` move
 * the active match without re-searching, and `clear` find exactly what `search` created.
 *
 * No `eval`, no `innerHTML` of anything the page or the query ever supplied: matches are found by
 * regex-scanning existing text-node DATA (already-rendered page text, not attacker input reinterpreted
 * as markup) and wrapped with plain `document.createElement`/`Node.splitText` calls. The query itself
 * never becomes HTML.
 */

export type WholeWordCommand = 'search' | 'step' | 'clear';

export interface WholeWordScriptArgs {
  /** Regex SOURCE from {@link buildWholeWordPattern}. Required for `search`; ignored otherwise. */
  source?: string;
  /** Regex FLAGS from {@link buildWholeWordPattern} (already includes `g`). */
  flags?: string;
  /** Step direction for `step`; ignored otherwise. */
  forward?: boolean;
}

/** Namespace the isolated-world state lives under. Exported for the test file only, to assert the
 *  script and the runtime use the same key instead of two independently-typed string literals drifting. */
export const WHOLE_WORD_STATE_KEY = '__tepegozWWF';

/** Hard cap on matches marked, mirroring the perception script's own emit caps — a pathological page
 *  (or a single-character query against a huge document) must not wrap thousands of nodes. */
const MAX_MATCHES = 2000;

/** Build the injectable expression for one command. Self-contained (no closure over host state, same
 *  discipline as `build-dom-tree-script.ts`), and self-invoked — the caller passes the returned string
 *  straight to `executeJavaScriptInIsolatedWorld` and reads its return value. */
export function wholeWordFindScript(
  command: WholeWordCommand,
  args: WholeWordScriptArgs = {},
): string {
  const cmd = JSON.stringify(command);
  const source = JSON.stringify(args.source ?? '');
  const flags = JSON.stringify(args.flags ?? 'g');
  const forward = args.forward !== false;

  return `(() => {
  const NS = ${JSON.stringify(WHOLE_WORD_STATE_KEY)};
  const CMD = ${cmd};
  const SOURCE = ${source};
  const FLAGS = ${flags};
  const FORWARD = ${String(forward)};
  const MAX_MATCHES = ${String(MAX_MATCHES)};
  const MARK_ATTR = 'data-tepegoz-wwf';
  const ACTIVE_STYLE = 'background:#ff9d2f;color:#1a1a1a;outline:2px solid #c2410c;border-radius:2px;';
  const MATCH_STYLE = 'background:#ffe066;color:#1a1a1a;border-radius:2px;';
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT']);

  const state = window[NS] || (window[NS] = { marks: [], active: 0 });

  const isVisible = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };

  const clearMarks = () => {
    for (const mark of state.marks) {
      const parent = mark.parentNode;
      if (!parent) continue;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      if (typeof parent.normalize === 'function') parent.normalize();
    }
    state.marks = [];
    state.active = 0;
  };

  // Text nodes only, in document order, skipping non-content tags and anything not rendered — mirrors
  // what a person can actually see, which is what "no results" should mean.
  const collectTextNodes = (root) => {
    const out = [];
    const walk = (node) => {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1) {
          if (SKIP_TAGS.has(child.tagName)) continue;
          if (!isVisible(child)) continue;
          walk(child);
        } else if (child.nodeType === 3 && child.data && child.data.trim() !== '') {
          if (isVisible(child.parentElement)) out.push(child);
        }
      }
    };
    walk(root);
    return out;
  };

  const applyStyles = () => {
    state.marks.forEach((mark, i) => {
      mark.setAttribute('style', i === state.active - 1 ? ACTIVE_STYLE : MATCH_STYLE);
    });
  };

  const scrollToActive = () => {
    const el = state.marks[state.active - 1];
    if (el && typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
      } catch (e) {
        // Some pages override scrollIntoView; losing the scroll is not worth failing the search over.
      }
    }
  };

  const search = () => {
    clearMarks();
    if (!SOURCE) return { matches: 0, activeMatchOrdinal: 0 };
    let re;
    try {
      re = new RegExp(SOURCE, FLAGS);
    } catch (e) {
      return { matches: 0, activeMatchOrdinal: 0 };
    }
    outer: for (const textNode of collectTextNodes(document.body)) {
      const text = textNode.data;
      re.lastIndex = 0;
      const ranges = [];
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) {
          re.lastIndex += 1;
          continue;
        }
        ranges.push([m.index, m.index + m[0].length]);
      }
      if (ranges.length === 0) continue;
      // Cut from the END of the node backwards so earlier offsets in \`text\` stay valid as the node is
      // split apart; collect this node's marks separately and append them in reading order, since the
      // end-to-start cut order would otherwise reverse them.
      // Splitting only ever removes the TAIL beyond \`start\`; processing ranges right-to-left means
      // every earlier range's offset into \`textNode.data\` is still valid when its turn comes.
      const nodeMarks = [];
      for (let i = ranges.length - 1; i >= 0; i--) {
        const [start, end] = ranges[i];
        const tail = textNode.splitText(start);
        tail.splitText(end - start);
        const mark = document.createElement('mark');
        mark.setAttribute(MARK_ATTR, '1');
        tail.parentNode.replaceChild(mark, tail);
        mark.appendChild(tail);
        nodeMarks.unshift(mark);
      }
      for (const mark of nodeMarks) {
        state.marks.push(mark);
        if (state.marks.length >= MAX_MATCHES) break outer;
      }
    }
    if (state.marks.length === 0) return { matches: 0, activeMatchOrdinal: 0 };
    state.active = 1;
    applyStyles();
    scrollToActive();
    return { matches: state.marks.length, activeMatchOrdinal: state.active };
  };

  const step = () => {
    if (state.marks.length === 0) return { matches: 0, activeMatchOrdinal: 0 };
    const delta = FORWARD ? 1 : -1;
    const n = state.marks.length;
    state.active = (((state.active - 1 + delta) % n) + n) % n + 1;
    applyStyles();
    scrollToActive();
    return { matches: state.marks.length, activeMatchOrdinal: state.active };
  };

  if (CMD === 'search') return search();
  if (CMD === 'step') return step();
  clearMarks();
  return { matches: 0, activeMatchOrdinal: 0 };
})()`;
}
