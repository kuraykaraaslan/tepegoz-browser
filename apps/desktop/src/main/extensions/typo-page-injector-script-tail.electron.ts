export const TYPO_SCRIPT_TAIL = `
  function decorateFormControl(el, issues) {
    const text = textOf(el);
    mirror = document.createElement('div');
    mirror.className =
      'tepegoz-typo-mirror' + (el instanceof HTMLInputElement ? ' tepegoz-typo-mirror-input' : '');
    copyMirrorStyle(el, mirror);
    appendIssueText(mirror, text, issues);
    document.documentElement.appendChild(mirror);
    const sync = () => {
      if (mirror === null) return;
      mirror.scrollTop = el.scrollTop;
      mirror.scrollLeft = el.scrollLeft;
      copyMirrorStyle(el, mirror);
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    mirrorCleanup = () => {
      el.removeEventListener('scroll', sync);
    };
    const spans = mirror.querySelectorAll('.tepegoz-typo-word');
    for (const span of spans) {
      const index = Number(span.dataset.tepegozTypoIssueIndex);
      rememberRect(index, span.getBoundingClientRect());
    }
    return spans[0]?.getBoundingClientRect() || null;
  }

  function rangeForOffsets(root, start, end) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let startNode = null;
    let endNode = null;
    let startOffset = 0;
    let endOffset = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const next = offset + node.nodeValue.length;
      if (startNode === null && start >= offset && start <= next) {
        startNode = node;
        startOffset = start - offset;
      }
      if (endNode === null && end >= offset && end <= next) {
        endNode = node;
        endOffset = end - offset;
        break;
      }
      offset = next;
    }
    if (startNode === null || endNode === null) return null;
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }

  function decorateContentEditable(el, issues) {
    let firstRect = null;
    for (let index = 0; index < issues.length; index += 1) {
      const issue = issues[index];
      const range = rangeForOffsets(el, issue.start, issue.end);
      if (range === null) continue;
      for (const rect of range.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (firstRect === null) firstRect = rect;
        rememberRect(index, rect);
        const line = document.createElement('div');
        line.className = 'tepegoz-typo-line';
        line.dataset.tepegozTypoIssueIndex = String(index);
        line.style.left = rect.left + 'px';
        line.style.top = Math.max(0, rect.bottom - 3) + 'px';
        line.style.width = rect.width + 'px';
        document.documentElement.appendChild(line);
        contentMarks.push(line);
      }
    }
    return firstRect;
  }

  function issueAtPoint(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const tolerance = 4;
    for (let i = issueRects.length - 1; i >= 0; i -= 1) {
      const rect = issueRects[i];
      if (
        x >= rect.left - tolerance &&
        x <= rect.right + tolerance &&
        y >= rect.top - tolerance &&
        y <= rect.bottom + tolerance
      ) {
        return lastIssues[rect.index] || null;
      }
    }
    return null;
  }

  function publicIssue(issue) {
    if (current === null) return null;
    const text = textOf(current);
    const suggestions = Array.isArray(issue.suggestions)
      ? issue.suggestions.map((value) => String(value)).filter(Boolean).slice(0, 8)
      : [];
    return {
      text: String(issue.text || text.slice(issue.start, issue.end)),
      start: issue.start,
      end: issue.end,
      language: String(issue.language || lastLanguage || ''),
      suggestions
    };
  }

  function decorateIssues(el, issues) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return decorateFormControl(el, issues);
    }
    return decorateContentEditable(el, issues);
  }

  function positionPopover(anchorRect, fallbackRect) {
    if (popover === null) return;
    const rect = anchorRect || fallbackRect;
    const top = Math.min(window.innerHeight - popover.offsetHeight - 8, rect.bottom + 6);
    const left = Math.min(window.innerWidth - popover.offsetWidth - 8, Math.max(8, rect.left));
    popover.style.top = Math.max(8, top) + 'px';
    popover.style.left = left + 'px';
  }

  function render(result) {
    if (current === null || !editable(current)) return;
    const text = textOf(current);
    const issues = normalizedIssues(result.issues, text);
    clearPopover();
    clearDecorations();
    lastResult = result;
    lastIssues = issues;
    lastLanguage = String(result.language || '');
    if (issues.length === 0) {
      lastResult = null;
      lastIssues = [];
      lastLanguage = '';
      return;
    }
    const first = issues[0];
    const rect = current.getBoundingClientRect();
    const anchorRect = decorateIssues(current, issues);
    popover = document.createElement('div');
    popover.className = 'tepegoz-typo-popover';
    const title = document.createElement('div');
    const word = document.createElement('strong');
    word.textContent = String(first.text || text.slice(first.start, first.end) || 'Typo');
    title.appendChild(word);
    title.appendChild(document.createTextNode(': ' + String(first.message || '')));
    popover.appendChild(title);
    for (const suggestion of (first.suggestions || []).slice(0, 4)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = suggestion;
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => applySuggestion(first, suggestion));
      popover.appendChild(button);
    }
    document.documentElement.appendChild(popover);
    positionPopover(anchorRect, rect);
  }

  function rerender() {
    if (current === null || lastResult === null) return;
    window.clearTimeout(rerenderTimer);
    rerenderTimer = window.setTimeout(() => {
      if (current !== null && lastResult !== null && editable(current)) render(lastResult);
    }, 50);
  }

  window.__tepegozTypoReceive = (payload) => {
    if (!payload || payload.requestId !== lastRequestId) return;
    render(payload.result || {});
  };

  window.__tepegozTypoIssueAt = (x, y) => {
    if (current === null || !editable(current)) return null;
    const issue = issueAtPoint(Number(x), Number(y));
    if (issue === null) return null;
    const exposed = publicIssue(issue);
    if (exposed === null || exposed.suggestions.length === 0) return null;
    return exposed;
  };

  window.__tepegozTypoApplySuggestion = (payload) => {
    if (current === null || !editable(current) || payload === null || typeof payload !== 'object') {
      return false;
    }
    return applyReplacement(
      Number(payload.start),
      Number(payload.end),
      String(payload.suggestion || '')
    ) === true;
  };

  document.addEventListener('focusin', (event) => {
    if (editable(event.target)) schedule(event.target);
  }, true);
  document.addEventListener('input', (event) => {
    if (editable(event.target)) schedule(event.target);
  }, true);
  document.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (!document.activeElement || !editable(document.activeElement)) hidePopover();
    }, 150);
  }, true);
  window.addEventListener('resize', rerender, { passive: true });
  window.addEventListener('scroll', rerender, true);
})();
`;
