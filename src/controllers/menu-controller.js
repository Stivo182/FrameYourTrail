const DEFAULT_VIEWPORT_MARGIN_PX = 24;
const DEFAULT_PANEL_SELECTOR =
  ".language-menu__panel, .metric-source-menu__panel, .map-style-menu__panel, .export-menu__panel";

/**
 * @param {HTMLDetailsElement} menu
 * @param {{ viewportWidth?: number, viewportMarginPx?: number, panelSelector?: string }} [options]
 */
export function alignMenuPanelToViewport(menu, options = {}) {
  const panel = menu.querySelector(options.panelSelector ?? DEFAULT_PANEL_SELECTOR);

  if (!(panel instanceof HTMLElement)) {
    return;
  }

  panel.style.removeProperty("--menu-panel-shift-x");

  if (!menu.open) {
    return;
  }

  const panelBox = panel.getBoundingClientRect();
  const viewportWidth =
    options.viewportWidth ?? (document.documentElement.clientWidth || window.innerWidth);
  const viewportMargin = Math.min(
    options.viewportMarginPx ?? DEFAULT_VIEWPORT_MARGIN_PX,
    viewportWidth / 2
  );
  const minX = viewportMargin;
  const maxX = viewportWidth - viewportMargin;
  let shiftX = 0;

  if (panelBox.left < minX) {
    shiftX = minX - panelBox.left;
  } else if (panelBox.right > maxX) {
    shiftX = maxX - panelBox.right;
  }

  if (shiftX !== 0) {
    panel.style.setProperty("--menu-panel-shift-x", `${shiftX}px`);
  }
}

/**
 * @param {Element} option
 * @param {string} menuSelector
 */
export function closeMenuFromOption(option, menuSelector) {
  const menu = option.closest(menuSelector);
  const summary = menu?.querySelector("summary");
  menu?.removeAttribute("open");
  if (summary instanceof HTMLElement) {
    summary.focus();
  }
}

/**
 * @param {ParentNode} root
 * @param {HTMLDetailsElement} openedMenu
 * @param {string} menuSelector
 */
export function closeOtherOpenMenus(root, openedMenu, menuSelector) {
  if (!openedMenu.open) {
    return;
  }

  root.querySelectorAll(menuSelector).forEach((menu) => {
    if (menu instanceof HTMLDetailsElement && menu !== openedMenu) {
      menu.removeAttribute("open");
    }
  });
}

/**
 * @param {ParentNode} root
 * @param {MouseEvent} event
 * @param {{ menuSelector: string, target?: EventTarget | null }} options
 */
export function closeOpenMenusFromOutsidePointer(root, event, options) {
  const target = options.target ?? event.target;

  if (!(target instanceof Node)) {
    return;
  }

  root.querySelectorAll(options.menuSelector).forEach((menu) => {
    if (menu instanceof HTMLDetailsElement && menu.open && !menu.contains(target)) {
      menu.removeAttribute("open");
    }
  });
}

/**
 * @param {ParentNode} root
 * @param {string} menuSelector
 */
export function isMenuSummaryFocused(root, menuSelector) {
  const summary = root.querySelector(`${menuSelector} summary`);
  return summary instanceof HTMLElement && document.activeElement === summary;
}

/**
 * @param {ParentNode} root
 * @param {string} menuSelector
 */
export function focusMenuSummary(root, menuSelector) {
  const summary = root.querySelector(`${menuSelector} summary`);

  if (!(summary instanceof HTMLElement)) {
    return false;
  }

  summary.focus();
  return true;
}

/**
 * @param {{ getRoot: () => ParentNode, menuSelector: string }} options
 */
export function createMenuFocusRestorer({ getRoot, menuSelector }) {
  let restorePending = false;

  function shouldRestoreAfterRender() {
    return restorePending || isMenuSummaryFocused(getRoot(), menuSelector);
  }

  function markPending() {
    restorePending = true;
  }

  function restorePendingFocus() {
    if (!restorePending) {
      return false;
    }

    restorePending = false;
    return focusMenuSummary(getRoot(), menuSelector);
  }

  return {
    markPending,
    restorePending: restorePendingFocus,
    shouldRestoreAfterRender
  };
}
