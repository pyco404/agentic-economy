// Match the copy/edit exceptions in styles.css. This runs only when a canvas
// gesture starts; it never cancels pointer events or touches input selections.
const selectable = '.ui-select-text, [data-selectable], input, textarea, [contenteditable]:not([contenteditable="false"]), pre, code, .mint, .agent-identity-value, .detail-list';
const chrome = '.ui-no-select, .topbar, .world-main, .global-world-layer, .mobile-navigation-layer, .app button, .app nav, .app select';

function elementAt(node: Node | null): Element | null {
  return node instanceof Element ? node : node?.parentElement ?? null;
}

export function clearAccidentalWorldSelection() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return;
  // Preserve intentional selections, including a range spanning copyable
  // content, and selections in documentation outside the world chrome.
  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i);
    const start = elementAt(range.startContainer);
    const end = elementAt(range.endContainer);
    if (!start?.closest(chrome) || !end?.closest(chrome) ||
        start.closest(selectable) || end.closest(selectable) ||
        range.cloneContents().querySelector(selectable)) return;
  }
  selection.removeAllRanges();
}
