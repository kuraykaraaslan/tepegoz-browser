import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { descriptor } from './descriptor';
import { networkWarning, interceptionNote, pageChanged } from './action-signals';
import { interactionResult } from './interaction-result';
import { UpdatePageArgs, selectOptionValue } from './tool-args';
import type { BrowserHost } from './host';

/**
 * `browser_update_page` — the single-interaction tool (click/hover/drag/fill/press/send_keys/scroll/
 * scroll_to_text/select_option) and its perceive→act→verify sequence. Split out of `browser-tools.ts`.
 */

/** Registers `browser_update_page` into the `CapabilityRegistry`, bound to `host`. */
export function registerUpdatePageTool(host: BrowserHost): void {
  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_update_page',
      'state_changing',
      'Perform ONE interaction on a page, using a `ref` from browser_get_elements on the same tab. args: ' +
        'one of { action: "click", ref, tabId? } · { action: "hover", ref, tabId? } (the ONLY way to ' +
        'open a menu that appears on :hover — it has no click handler, so its links are not listed ' +
        'until the pointer is over the trigger) · ' +
        '{ action: "drag", ref, targetRef, tabId? } to drag the element at `ref` onto the element at ' +
        '`targetRef` (both from browser_get_elements) — for reordering a list, moving a card between ' +
        'columns, or a slider/handle; returns which of two drag mechanisms ran in `dragMode` ' +
        '("native"|"pointer"), which you can ignore unless the drag visibly did not work · ' +
        '{ action: "fill", ref, text, tabId? } · ' +
        '{ action: "press", key, tabId? } (e.g. "Enter", "Tab", "Escape", "ArrowDown") · ' +
        '{ action: "send_keys", keys, tabId? } for a chord or a sequence ("Ctrl+A", "Shift+Tab", ' +
        '"Ctrl+A Delete") — an unsendable keystroke comes back in `unsupportedKeys` rather than failing ' +
        'the step · ' +
        '{ action: "scroll", direction: "up"|"down", amount?, tabId? } · ' +
        '{ action: "scroll_to_text", text, nth?, tabId? } to bring an off-screen target INTO view so it ' +
        'appears in browser_get_elements (use this instead of blind scrolling when you know the label/text; ' +
        '`nth` picks the Nth match, default 1) · ' +
        '{ action: "select_option", ref, value, tabId? } to choose an option in a native <select> dropdown ' +
        '(a native select opens an OS popup that a click/press cannot drive — ALWAYS use this, never click ' +
        'then arrow/type; `value` matches the option label or value). Omit tabId for the active tab. ' +
        'File inputs must be handled through upload_create_item so path grants, approval, and audit apply. ' +
        'Returns { ok, url, title, changed, recoveryHint?, note?, found?, filled? }. ' +
        'For "fill" the result to trust is `filled` — the field value is read back and compared, because a ' +
        'fill never moves page text or structure, so changed=false is EXPECTED after a fill that worked. ' +
        'Never re-fill a field that reported filled=true. changed=true also fires when a ' +
        'click opens a menu/drawer/panel with no new page text (a `note` then says to re-read elements); ' +
        'scroll_to_text returns found=true|false. If ' +
        'changed=false, re-read elements (and scroll if the target may be off-screen) before trying a ' +
        'different ref — never repeat the same ref blindly. ' +
        'A `networkWarning` field appears when a request this interaction sent came back as an HTTP error ' +
        '(e.g. a Save that POSTs and gets 403/500 while the page shows nothing) — treat it as evidence the ' +
        'action did not really take effect and verify before reporting success. Its ABSENCE proves nothing.',
    ),
    inputSchema: UpdatePageArgs,
    handler: async (args) => {
      const before = await host.readPage(args.tabId);
      // S3 PR3: a tab spawned by this interaction is invisible on the acting page, so the only way to
      // notice it is to compare the open set either side of the action.
      const tabsBefore = new Set((host.listOpenTabs?.() ?? []).map((t) => t.id));
      // Action window opens here — after the `before` read, so only requests THIS interaction caused are
      // attributed to it. Same host clock the recorder stamps observations with.
      const actedAt = Date.now();
      let found: boolean | undefined;
      let matchCount: number | undefined;
      let selected: string | null | undefined;
      let optionLabels: string[] | undefined;
      let fieldValue: string | null | undefined;
      let unsupportedKeys: string[] | undefined;
      let occludedBy: string | null | undefined;
      let fillWidget: 'readonly' | 'disabled' | 'combobox' | null | undefined;
      let dragMode: 'native' | 'pointer' | undefined;
      switch (args.action) {
        case 'click':
          ({ occludedBy } = await host.clickElement(args.ref, args.tabId));
          break;
        case 'hover':
          await host.hoverElement(args.ref, args.tabId);
          break;
        case 'drag':
          ({ mode: dragMode } = await host.dragElement(args.ref, args.targetRef, args.tabId));
          break;
        case 'fill':
          ({ widget: fillWidget } = await host.fillElement(args.ref, args.text, args.tabId));
          // Read the value back on the SAME snapshot ref (no re-snapshot, so refs stay valid) — the only
          // honest way to tell a fill that worked from one that silently did not.
          fieldValue = await host.readElementValue(args.ref, args.tabId).catch(() => null);
          break;
        case 'press':
          ({ unsupported: unsupportedKeys } = await host.pressKey(args.key, args.tabId));
          break;
        case 'send_keys':
          ({ unsupported: unsupportedKeys } = await host.sendKeys(args.keys, args.tabId));
          break;
        case 'scroll':
          await host.scrollPage(args.direction, args.amount, args.tabId);
          break;
        case 'scroll_to_text':
          ({ found, count: matchCount } = await host.scrollToText(args.text, args.nth, args.tabId));
          break;
        case 'select_option': {
          const optValue = selectOptionValue(args);
          if (optValue !== undefined) {
            ({ selected, options: optionLabels } = await host.selectOption(
              args.ref,
              optValue,
              args.tabId,
            ));
          }
          break;
        }
      }
      const spawnedTabs = (host.listOpenTabs?.() ?? []).filter((t) => !tabsBefore.has(t.id));
      const after = await host.readPage(args.tabId);
      // Post-action verification, DOM-level AND network-level (AI-8B): the structural delta alone cannot
      // see a request the server rejected while the UI stayed put.
      const warning = await networkWarning(host, args.tabId, actedAt, after.url);
      // S3 PR4: a confirm()/alert() the click raised, or a beforeunload the click's navigation tripped
      // (e.g. clicking an <a href>), is otherwise invisible to the model — it already got auto-declined
      // at the host boundary, so this is purely the report.
      const dialogNote = await interceptionNote(host, args.tabId, actedAt);
      const result = interactionResult(args, {
        before,
        after,
        changed: pageChanged(before, after),
        networkFailed: warning !== undefined,
        found,
        matchCount,
        selected,
        optionLabels,
        fieldValue,
        unsupportedKeys,
        occludedBy,
        spawnedTabs,
        fillWidget,
        dragMode,
      });
      const withWarning = warning === undefined ? result : { ...result, networkWarning: warning };
      return dialogNote === undefined
        ? withWarning
        : {
            ...withWarning,
            note: withWarning.note === undefined ? dialogNote : `${withWarning.note} ${dialogNote}`,
          };
    },
  });
}
