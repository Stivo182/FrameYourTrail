import { describe, expect, it } from "vitest";

import {
  alignMenuPanelToViewport,
  closeOpenMenusFromOutsidePointer,
  closeOtherOpenMenus,
  closeMenuFromOption,
  createMenuFocusRestorer,
  isMenuSummaryFocused
} from "../../src/controllers/menu-controller.js";

function createMenuRoot() {
  const root = document.createElement("div");
  root.innerHTML = `
    <details data-language-menu open>
      <summary tabindex="0">EN</summary>
      <fieldset class="language-menu__panel"></fieldset>
      <label>
        <input data-language-option value="en" />
      </label>
    </details>
  `;
  document.body.replaceChildren(root);
  return root;
}

function createMapStyleMenuRoot() {
  const root = document.createElement("div");
  root.innerHTML = `
    <details data-map-style-menu open>
      <summary tabindex="0">OpenFreeMap</summary>
      <fieldset class="map-style-menu__panel"></fieldset>
    </details>
  `;
  document.body.replaceChildren(root);
  return root;
}

function createExportMenuRoot() {
  const root = document.createElement("div");
  root.innerHTML = `
    <details data-export-menu open>
      <summary tabindex="0">Export</summary>
      <div class="export-menu__panel"></div>
    </details>
  `;
  document.body.replaceChildren(root);
  return root;
}

function createSelectorMenuRoot() {
  const root = document.createElement("div");
  root.innerHTML = `
    <details data-language-menu open>
      <summary tabindex="0">EN</summary>
      <fieldset class="language-menu__panel"></fieldset>
    </details>
    <details data-analysis-mode-menu open>
      <summary tabindex="0">Original</summary>
      <fieldset class="metric-source-menu__panel"></fieldset>
    </details>
    <details data-map-style-menu>
      <summary tabindex="0">OpenFreeMap</summary>
      <fieldset class="map-style-menu__panel"></fieldset>
    </details>
    <details data-export-menu open>
      <summary tabindex="0">Export</summary>
      <div class="export-menu__panel"></div>
    </details>
    <details data-unrelated-menu open>
      <summary tabindex="0">Unrelated</summary>
    </details>
  `;
  document.body.replaceChildren(root);
  return root;
}

/**
 * @param {ParentNode} root
 */
function getMenu(root) {
  const menu = root.querySelector("[data-language-menu]");
  if (!(menu instanceof HTMLDetailsElement)) {
    throw new Error("Expected language menu");
  }
  return menu;
}

/**
 * @param {ParentNode} root
 */
function getMapStyleMenu(root) {
  const menu = root.querySelector("[data-map-style-menu]");
  if (!(menu instanceof HTMLDetailsElement)) {
    throw new Error("Expected map style menu");
  }
  return menu;
}

/**
 * @param {ParentNode} root
 */
function getExportMenu(root) {
  const menu = root.querySelector("[data-export-menu]");
  if (!(menu instanceof HTMLDetailsElement)) {
    throw new Error("Expected export menu");
  }
  return menu;
}

/**
 * @param {ParentNode} root
 */
function getPanel(root) {
  const panel = root.querySelector(".language-menu__panel");
  if (!(panel instanceof HTMLElement)) {
    throw new Error("Expected language menu panel");
  }
  return panel;
}

/**
 * @param {ParentNode} root
 */
function getMapStylePanel(root) {
  const panel = root.querySelector(".map-style-menu__panel");
  if (!(panel instanceof HTMLElement)) {
    throw new Error("Expected map style menu panel");
  }
  return panel;
}

/**
 * @param {ParentNode} root
 */
function getExportPanel(root) {
  const panel = root.querySelector(".export-menu__panel");
  if (!(panel instanceof HTMLElement)) {
    throw new Error("Expected export menu panel");
  }
  return panel;
}

/**
 * @param {ParentNode} root
 */
function getOption(root) {
  const option = root.querySelector("[data-language-option]");
  if (!(option instanceof HTMLElement)) {
    throw new Error("Expected language option");
  }
  return option;
}

/**
 * @param {ParentNode} root
 */
function getSummary(root) {
  const summary = root.querySelector("summary");
  if (!(summary instanceof HTMLElement)) {
    throw new Error("Expected menu summary");
  }
  return summary;
}

describe("menu controller", () => {
  it("shifts an open menu panel back inside the viewport", () => {
    const root = createMenuRoot();
    const menu = getMenu(root);
    const panel = getPanel(root);

    panel.getBoundingClientRect = () =>
      /** @type {DOMRect} */ ({
        left: 290,
        right: 370,
        top: 0,
        bottom: 0,
        width: 80,
        height: 0,
        x: 290,
        y: 0,
        toJSON: () => ({})
      });

    alignMenuPanelToViewport(menu, { viewportWidth: 320, viewportMarginPx: 24 });

    expect(panel.style.getPropertyValue("--menu-panel-shift-x")).toBe("-74px");
  });

  it("shifts an open map style menu panel back inside the viewport", () => {
    const root = createMapStyleMenuRoot();
    const menu = getMapStyleMenu(root);
    const panel = getMapStylePanel(root);

    panel.getBoundingClientRect = () =>
      /** @type {DOMRect} */ ({
        left: 290,
        right: 370,
        top: 0,
        bottom: 0,
        width: 80,
        height: 0,
        x: 290,
        y: 0,
        toJSON: () => ({})
      });

    alignMenuPanelToViewport(menu, { viewportWidth: 320, viewportMarginPx: 24 });

    expect(panel.style.getPropertyValue("--menu-panel-shift-x")).toBe("-74px");
  });

  it("shifts an open export menu panel back inside the viewport", () => {
    const root = createExportMenuRoot();
    const menu = getExportMenu(root);
    const panel = getExportPanel(root);

    panel.getBoundingClientRect = () =>
      /** @type {DOMRect} */ ({
        left: 290,
        right: 370,
        top: 0,
        bottom: 0,
        width: 80,
        height: 0,
        x: 290,
        y: 0,
        toJSON: () => ({})
      });

    alignMenuPanelToViewport(menu, { viewportWidth: 320, viewportMarginPx: 24 });

    expect(panel.style.getPropertyValue("--menu-panel-shift-x")).toBe("-74px");
  });

  it("removes stale shift and skips closed menus", () => {
    const root = createMenuRoot();
    const menu = getMenu(root);
    const panel = getPanel(root);

    panel.style.setProperty("--menu-panel-shift-x", "10px");
    menu.removeAttribute("open");

    alignMenuPanelToViewport(menu, { viewportWidth: 320, viewportMarginPx: 24 });

    expect(panel.style.getPropertyValue("--menu-panel-shift-x")).toBe("");
  });

  it("closes a menu from an option and restores summary focus", () => {
    const root = createMenuRoot();
    const menu = getMenu(root);
    const option = getOption(root);
    const summary = getSummary(root);

    closeMenuFromOption(option, "[data-language-menu]");

    expect(menu.hasAttribute("open")).toBe(false);
    expect(document.activeElement).toBe(summary);
  });

  it("closes other open selector menus when a selector menu opens", () => {
    const root = createSelectorMenuRoot();
    const languageMenu = root.querySelector("[data-language-menu]");
    const analysisModeMenu = root.querySelector("[data-analysis-mode-menu]");
    const mapStyleMenu = root.querySelector("[data-map-style-menu]");
    const exportMenu = root.querySelector("[data-export-menu]");
    const unrelatedMenu = root.querySelector("[data-unrelated-menu]");
    const menuSelector =
      "[data-language-menu], [data-analysis-mode-menu], [data-map-style-menu], [data-export-menu]";

    if (
      !(languageMenu instanceof HTMLDetailsElement) ||
      !(analysisModeMenu instanceof HTMLDetailsElement) ||
      !(mapStyleMenu instanceof HTMLDetailsElement) ||
      !(exportMenu instanceof HTMLDetailsElement) ||
      !(unrelatedMenu instanceof HTMLDetailsElement)
    ) {
      throw new Error("Expected selector menus");
    }

    mapStyleMenu.open = true;
    closeOtherOpenMenus(root, mapStyleMenu, menuSelector);

    expect(languageMenu.open).toBe(false);
    expect(analysisModeMenu.open).toBe(false);
    expect(mapStyleMenu.open).toBe(true);
    expect(exportMenu.open).toBe(false);
    expect(unrelatedMenu.open).toBe(true);
  });

  it("closes open selector menus when the pointer lands outside them", () => {
    const root = createSelectorMenuRoot();
    const languageMenu = root.querySelector("[data-language-menu]");
    const analysisModeMenu = root.querySelector("[data-analysis-mode-menu]");
    const unrelatedMenu = root.querySelector("[data-unrelated-menu]");
    const outsideButton = document.createElement("button");
    const menuSelector =
      "[data-language-menu], [data-analysis-mode-menu], [data-map-style-menu], [data-export-menu]";

    document.body.append(outsideButton);

    if (
      !(languageMenu instanceof HTMLDetailsElement) ||
      !(analysisModeMenu instanceof HTMLDetailsElement) ||
      !(unrelatedMenu instanceof HTMLDetailsElement)
    ) {
      throw new Error("Expected selector menus");
    }

    closeOpenMenusFromOutsidePointer(root, new MouseEvent("mousedown", { bubbles: true }), {
      menuSelector,
      target: languageMenu.querySelector("summary")
    });

    expect(languageMenu.open).toBe(true);

    closeOpenMenusFromOutsidePointer(root, new MouseEvent("mousedown", { bubbles: true }), {
      menuSelector,
      target: outsideButton
    });

    expect(languageMenu.open).toBe(false);
    expect(analysisModeMenu.open).toBe(false);
    expect(unrelatedMenu.open).toBe(true);
  });

  it("restores menu focus after the root rerenders", () => {
    const root = createMenuRoot();
    const restorer = createMenuFocusRestorer({
      getRoot: () => root,
      menuSelector: "[data-language-menu]"
    });

    getSummary(root).focus();
    expect(isMenuSummaryFocused(root, "[data-language-menu]")).toBe(true);
    expect(restorer.shouldRestoreAfterRender()).toBe(true);

    root.innerHTML = `
      <details data-language-menu>
        <summary tabindex="0">RU</summary>
      </details>
    `;
    restorer.markPending();

    expect(restorer.restorePending()).toBe(true);
    expect(document.activeElement).toBe(getSummary(root));
    expect(restorer.restorePending()).toBe(false);
  });
});
