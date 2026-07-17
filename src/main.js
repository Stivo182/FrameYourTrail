import "./styles/base.css";
import "./styles/app.css";
import {
  ANALYSIS_MODES,
  getSelectableAnalysisModes,
  getDefaultAnalysisMode,
  isAnalysisModeAvailable,
  normalizeAnalysisMode
} from "./core/analysis-modes.js";
import { resolveAnalysisModeChange } from "./controllers/analysis-mode-controller.js";
import { preventInactiveFileDrop } from "./controllers/drop-controller.js";
import { exportPoster } from "./controllers/export-controller.js";
import {
  alignMenuPanelToViewport,
  closeOpenMenusFromOutsidePointer,
  closeOtherOpenMenus,
  closeMenuFromOption,
  createMenuFocusRestorer
} from "./controllers/menu-controller.js";
import { resolveTrackFileSelection } from "./controllers/source-file-controller.js";
import { createTrackLocationController } from "./controllers/track-location-controller.js";
import {
  createCachedI18n,
  isLocaleLoaded,
  loadI18n,
  resolveInitialLanguage,
  saveLanguage
} from "./i18n/index.js";
import {
  escapeHtml,
  renderAppShell,
  renderEmptyState,
  renderExportControls,
  renderLanguageSelect,
  renderMapStyleSelect,
  renderMessages,
  renderWorkspaceShell
} from "./render/app-shell.js";
import { normalizeMapStyleId } from "./render/map-styles.js";
import { createPreviewRenderer } from "./render/preview-renderer.js";
import { isSupportedTrackFile, readTrackSourceFile } from "./services/file-loader.js";
import { supportsClipboardImage } from "./services/export-capabilities.js";
import { isTerrainElevationProviderEnabled } from "./services/terrain-provider-config.js";
import { createTrackAnalysisAdapter } from "./services/track-analysis-adapter.js";
import { reverseGeocodeTrackLocation } from "./services/track-location-service.js";
import { createState } from "./state/app-state.js";

const appRoot = document.querySelector("#app");
const SELECTOR_MENU_SELECTOR =
  "[data-language-menu], [data-analysis-mode-menu], [data-map-style-menu], [data-export-menu]";

if (!(appRoot instanceof HTMLElement)) {
  throw new Error("App root was not found");
}

const app = appRoot;

const ANALYSIS_MODE_LABELS = Object.freeze({
  [ANALYSIS_MODES.filtered]: "Recommended",
  [ANALYSIS_MODES.raw]: "From track points",
  [ANALYSIS_MODES.terrain]: "Terrain elevation",
  [ANALYSIS_MODES.imported]: "File totals"
});

const ANALYSIS_MODE_DESCRIPTION_FALLBACKS = Object.freeze({
  [ANALYSIS_MODES.filtered]: "Uses cleaned track points for stable poster metrics.",
  [ANALYSIS_MODES.raw]: "Recalculates metrics from file points after standard cleanup.",
  [ANALYSIS_MODES.terrain]: "Uses terrain elevation that is already available for this track.",
  recomputed_terrain_request: "Loads terrain elevation and recalculates climb metrics.",
  [ANALYSIS_MODES.imported]: "Uses summary totals embedded in the source file."
});

const ANALYSIS_MODE_STORAGE_KEY = "frame-your-trail-analysis-mode";
const MAP_STYLE_STORAGE_KEY = "frame-your-trail-map-style";
/** @type {ReadonlySet<string>} */
const PERSISTABLE_ANALYSIS_MODES = new Set(Object.values(ANALYSIS_MODES));
const terrainElevationProviderEnabled = isTerrainElevationProviderEnabled();
const persistentStorage = getSafeLocalStorage();

let state = createState({
  language: resolveInitialLanguage(window.navigator, persistentStorage),
  analysisMode: readSavedAnalysisMode(persistentStorage),
  mapStyleId: readSavedMapStyle(persistentStorage)
});
let sourceAnalysisRequestToken = 0;
let modeAnalysisRequestToken = 0;
let appRenderRequestToken = 0;
let activePosterOutputCount = 0;
let printRequestPending = false;
/** @type {Promise<typeof import("./render/templates.js")> | undefined} */
let posterRendererModulePromise;
/** @type {ReturnType<import("./render/map.js").createRouteMapRenderer> | null} */
let routeMapRenderer = null;
let routeMapRendererPromise;
const trackAnalysisAdapter = createTrackAnalysisAdapter();
const previewRenderer = createPreviewRenderer({ loadPosterRenderer, getRouteMapRenderer });
const languageMenuFocus = createMenuFocusRestorer({
  getRoot: () => app,
  menuSelector: "[data-language-menu]"
});
const analysisModeMenuFocus = createMenuFocusRestorer({
  getRoot: () => app,
  menuSelector: "[data-analysis-mode-menu]"
});
const mapStyleMenuFocus = createMenuFocusRestorer({
  getRoot: () => app,
  menuSelector: "[data-map-style-menu]"
});
const exportMenuFocus = createMenuFocusRestorer({
  getRoot: () => app,
  menuSelector: "[data-export-menu]"
});
const trackLocationController = createTrackLocationController({
  getState: () => state,
  setState: (nextState) => {
    state = nextState;
  },
  renderApp,
  reverseGeocodeTrackLocation,
  isCurrentSourceRequest: isCurrentSourceAnalysisRequest,
  getCurrentSourceRequestToken: () => sourceAnalysisRequestToken,
  isPosterOutputActive: () => activePosterOutputCount > 0
});

document.addEventListener("mousedown", (event) => {
  closeOpenMenusFromOutsidePointer(app, event, { menuSelector: SELECTOR_MENU_SELECTOR });
});

renderApp();

function renderApp() {
  const renderRequestToken = ++appRenderRequestToken;
  const renderLanguage = state.language;

  renderAppWithI18n(createCachedI18n(renderLanguage));

  if (isLocaleLoaded(renderLanguage)) {
    return;
  }

  void loadI18n(renderLanguage).then((i18n) => {
    if (renderRequestToken !== appRenderRequestToken || state.language !== renderLanguage) {
      return;
    }

    renderAppWithI18n(i18n);
  });
}

/**
 * @param {Awaited<ReturnType<typeof loadI18n>>} i18n
 */
function renderAppWithI18n(i18n) {
  document.documentElement.lang = i18n.language;
  const shouldRestoreLanguageMenuFocus = languageMenuFocus.shouldRestoreAfterRender();
  const shouldRestoreAnalysisModeMenuFocus = analysisModeMenuFocus.shouldRestoreAfterRender();
  const shouldRestoreMapStyleMenuFocus = mapStyleMenuFocus.shouldRestoreAfterRender();
  const shouldRestoreExportMenuFocus = exportMenuFocus.shouldRestoreAfterRender();

  disposeRouteMapRenderer();
  previewRenderer.reset();

  const hasPoster = Boolean(state.parsed && state.analysis);

  app.innerHTML = renderAppShell({
    i18n,
    hasPoster,
    analysisModeSelectHtml: hasPoster ? renderAnalysisModeSelect(i18n) : "",
    mapStyleSelectHtml: hasPoster ? renderMapStyleSelect(i18n, state.mapStyleId) : "",
    exportControlsHtml: hasPoster
      ? renderExportControls(i18n, { clipboardSupported: supportsClipboardImage() })
      : "",
    languageSelectHtml: renderLanguageSelect(i18n),
    messagesHtml: renderMessages({ errors: state.errors, warnings: state.warnings }, i18n),
    contentHtml: hasPoster ? renderWorkspaceShell() : renderEmptyState(i18n)
  });

  bindControls();
  if (shouldRestoreLanguageMenuFocus) {
    languageMenuFocus.markPending();
  }
  languageMenuFocus.restorePending();
  if (shouldRestoreAnalysisModeMenuFocus) {
    analysisModeMenuFocus.markPending();
  }
  analysisModeMenuFocus.restorePending();
  if (shouldRestoreMapStyleMenuFocus) {
    mapStyleMenuFocus.markPending();
  }
  mapStyleMenuFocus.restorePending();
  if (shouldRestoreExportMenuFocus) {
    exportMenuFocus.markPending();
  }
  exportMenuFocus.restorePending();

  if (state.parsed && state.analysis) {
    renderPreview(i18n);
  }
}

/**
 * @param {Awaited<ReturnType<typeof loadI18n>>} i18n
 */
function renderAnalysisModeSelect(i18n) {
  if (!state.parsed) {
    return "";
  }

  const modes = getSelectableAnalysisModes(state.parsed, {
    allowTerrainReplacement: terrainElevationProviderEnabled
  });
  const selectedMode = modes.includes(state.analysisMode)
    ? state.analysisMode
    : getDefaultAnalysisMode(state.parsed);
  const sourceLabel = i18n.t("analysis.sourceLabel");
  const sourceSelectLabel = i18n.t("analysis.sourceSelectLabel");
  const selectedLabel = getAnalysisModeLabel(selectedMode, i18n, {
    terrainReplacementRequest: isTerrainReplacementRequest(selectedMode)
  });

  return `
    <details class="metric-source-menu" data-analysis-mode-menu>
      <summary title="${escapeHtml(sourceSelectLabel)}">
        <span class="metric-source-menu__prefix">${escapeHtml(sourceLabel)}:</span>
        <span class="metric-source-menu__value">${escapeHtml(selectedLabel)}</span>
      </summary>
      <fieldset class="metric-source-menu__panel">
        <legend>${escapeHtml(sourceSelectLabel)}</legend>
        ${modes.map((mode) => renderAnalysisModeOption(mode, selectedMode, i18n)).join("")}
      </fieldset>
    </details>
  `;
}

/**
 * @param {string} mode
 * @param {string} selectedMode
 * @param {Awaited<ReturnType<typeof loadI18n>>} i18n
 */
function renderAnalysisModeOption(mode, selectedMode, i18n) {
  const terrainReplacementRequest = isTerrainReplacementRequest(mode);
  const label = getAnalysisModeLabel(mode, i18n, { terrainReplacementRequest });
  const description = getAnalysisModeDescription(mode, i18n, { terrainReplacementRequest });

  return `
    <label class="metric-source-menu__option">
      <input
        type="radio"
        name="analysis-mode"
        value="${escapeHtml(mode)}"
        data-analysis-mode-option
        ${mode === selectedMode ? "checked" : ""}
      />
      <span class="metric-source-menu__copy">
        <span class="metric-source-menu__label">${escapeHtml(label)}</span>
        <span class="metric-source-menu__description">${escapeHtml(description)}</span>
      </span>
    </label>
  `;
}

/**
 * @param {string} mode
 */
function isTerrainReplacementRequest(mode) {
  return (
    mode === ANALYSIS_MODES.terrain &&
    state.parsed !== null &&
    !isAnalysisModeAvailable(state.parsed, mode)
  );
}

/**
 * @param {string} mode
 * @param {Awaited<ReturnType<typeof loadI18n>>} i18n
 * @param {{ terrainReplacementRequest?: boolean }} [options]
 */
function getAnalysisModeLabel(mode, i18n, options = {}) {
  const key =
    options.terrainReplacementRequest === true
      ? "analysis.modes.recomputed_terrain_request"
      : `analysis.modes.${mode}`;
  return translateWithFallback(i18n, key, ANALYSIS_MODE_LABELS[mode] ?? mode);
}

/**
 * @param {string} mode
 * @param {Awaited<ReturnType<typeof loadI18n>>} i18n
 * @param {{ terrainReplacementRequest?: boolean }} [options]
 */
function getAnalysisModeDescription(mode, i18n, options = {}) {
  const key =
    options.terrainReplacementRequest === true
      ? "analysis.modeDescriptions.recomputed_terrain_request"
      : `analysis.modeDescriptions.${mode}`;
  const fallbackKey =
    options.terrainReplacementRequest === true ? "recomputed_terrain_request" : mode;
  return translateWithFallback(i18n, key, ANALYSIS_MODE_DESCRIPTION_FALLBACKS[fallbackKey] ?? "");
}

/**
 * @param {Awaited<ReturnType<typeof loadI18n>>} i18n
 * @param {string} key
 * @param {string} fallback
 */
function translateWithFallback(i18n, key, fallback) {
  const translated = i18n.t(key);
  return translated === key ? fallback : translated;
}

function bindControls() {
  app.querySelector("[data-file-input]")?.addEventListener("change", (event) => {
    void handleFileChange(event);
  });

  app.querySelectorAll(SELECTOR_MENU_SELECTOR).forEach((menu) => {
    if (menu instanceof HTMLDetailsElement) {
      menu.addEventListener("toggle", () => {
        closeOtherOpenMenus(app, menu, SELECTOR_MENU_SELECTOR);
        alignMenuPanelToViewport(menu);
      });
    }
  });

  app.querySelectorAll("[data-language-option]").forEach((option) => {
    if (!(option instanceof HTMLInputElement)) {
      return;
    }

    option.addEventListener("change", () => {
      if (!option.checked) {
        return;
      }

      const selectedLanguage = option.value;
      window.setTimeout(() => {
        const languageChanged = selectedLanguage !== state.language;
        if (languageChanged) {
          trackLocationController.invalidate();
        }

        closeMenuFromOption(option, "[data-language-menu]");
        languageMenuFocus.markPending();
        saveLanguage(selectedLanguage, persistentStorage);
        state = createState({
          ...state,
          language: selectedLanguage,
          trackLocation: languageChanged ? null : state.trackLocation
        });
        renderApp();
        if (languageChanged && state.parsed && state.analysis) {
          void trackLocationController.request(state.parsed, selectedLanguage);
        }
      }, 0);
    });

    option.addEventListener("click", () => {
      if (option.checked && option.value === state.language) {
        closeMenuFromOption(option, "[data-language-menu]");
      }
    });
  });

  app.querySelectorAll("[data-analysis-mode-option]").forEach((option) => {
    if (!(option instanceof HTMLInputElement)) {
      return;
    }

    option.addEventListener("change", () => {
      if (!option.checked) {
        return;
      }

      const selectedMode = option.value;
      window.setTimeout(() => {
        closeMenuFromOption(option, "[data-analysis-mode-menu]");
        analysisModeMenuFocus.markPending();
        void handleAnalysisModeChange(selectedMode);
      }, 0);
    });
  });

  app.querySelectorAll("[data-map-style-option]").forEach((option) => {
    if (!(option instanceof HTMLInputElement)) {
      return;
    }

    option.addEventListener("change", () => {
      if (!option.checked) {
        return;
      }

      const selectedMapStyleId = normalizeMapStyleId(option.value);
      window.setTimeout(() => {
        closeMenuFromOption(option, "[data-map-style-menu]");
        mapStyleMenuFocus.markPending();
        saveMapStyle(selectedMapStyleId, persistentStorage);
        state = createState({
          ...state,
          mapStyleId: selectedMapStyleId
        });
        renderApp();
      }, 0);
    });

    option.addEventListener("click", () => {
      if (option.checked && option.value === state.mapStyleId) {
        closeMenuFromOption(option, "[data-map-style-menu]");
      }
    });
  });

  const dropZone = app.querySelector("[data-drop-zone]");
  dropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.add("app-shell--dragging");
  });
  dropZone?.addEventListener("dragleave", () => {
    dropZone.classList.remove("app-shell--dragging");
  });
  dropZone?.addEventListener("drop", (event) => {
    event.stopPropagation();
    void handleDrop(/** @type {DragEvent} */ (event));
  });
  app.addEventListener("dragover", preventInactiveFileDrop);
  app.addEventListener("drop", preventInactiveFileDrop);

  app.querySelectorAll("[data-export]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.addEventListener("click", () => {
      const kind = button.dataset.export;

      if (kind) {
        closeMenuFromOption(button, "[data-export-menu]");
        exportMenuFocus.markPending();
        void handleExport(kind);
      }
    });
  });

  app.querySelector("[data-print]")?.addEventListener("click", () => {
    if (printRequestPending) {
      return;
    }

    void handlePrint();
  });
}

function closeOpenSelectorMenus() {
  app.querySelectorAll(SELECTOR_MENU_SELECTOR).forEach((menu) => {
    if (menu instanceof HTMLDetailsElement) {
      menu.removeAttribute("open");
    }
  });
}

/**
 * @param {string} selected
 */
async function handleAnalysisModeChange(selected) {
  const result = await resolveAnalysisModeChange({
    selected,
    getState: () => state,
    getNextRequestToken: getNextModeAnalysisRequestToken,
    isCurrentRequest: isCurrentModeAnalysisRequest,
    terrainElevationProviderEnabled,
    analyzeParsedTrack: trackAnalysisAdapter.analyzeParsedTrack,
    enrichParsedTrackFromTerrain: trackAnalysisAdapter.enrichParsedTrackFromTerrain
  });

  if (!result.shouldRender) {
    return;
  }

  const nextState = result.state;
  const analysisModeChanged = nextState.analysisMode !== state.analysisMode;

  state = nextState;
  if (analysisModeChanged) {
    saveAnalysisMode(state.analysisMode, persistentStorage);
  }
  renderApp();
}

/**
 * @param {DragEvent} event
 */
async function handleDrop(event) {
  event.preventDefault();
  app.querySelector("[data-drop-zone]")?.classList.remove("app-shell--dragging");
  await processFile(event.dataTransfer?.files?.[0] ?? null);
}

/**
 * @param {Event} event
 */
async function handleFileChange(event) {
  const input = event.target;

  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  await processFile(input.files?.[0] ?? null);
}

/**
 * @param {File | null | undefined} file
 */
async function processFile(file) {
  const result = await resolveTrackFileSelection({
    file,
    getState: () => state,
    getNextSourceRequestToken: getNextSourceAnalysisRequestToken,
    isCurrentSourceRequest: isCurrentSourceAnalysisRequest,
    invalidateModeAnalysisRequests,
    invalidateTrackLocationRequests: trackLocationController.invalidate,
    getPreviousDefaultAnalysisMode,
    terrainElevationProviderEnabled,
    isSupportedTrackFile,
    readTrackSourceFile,
    analyzeTrackSource: trackAnalysisAdapter.analyzeTrackSource,
    getDateLabel
  });

  if (!result.shouldRender) {
    return;
  }

  state = result.state;
  renderApp();
  if (result.locationRequest) {
    void trackLocationController.request(
      result.locationRequest.parsed,
      result.locationRequest.language,
      result.locationRequest.sourceRequestToken
    );
  }
}

function getPreviousDefaultAnalysisMode() {
  return state.parsed ? getDefaultAnalysisMode(state.parsed) : ANALYSIS_MODES.filtered;
}

function getNextSourceAnalysisRequestToken() {
  sourceAnalysisRequestToken += 1;
  return sourceAnalysisRequestToken;
}

/**
 * @param {number} token
 */
function isCurrentSourceAnalysisRequest(token) {
  return token === sourceAnalysisRequestToken;
}

function getNextModeAnalysisRequestToken() {
  modeAnalysisRequestToken += 1;
  return modeAnalysisRequestToken;
}

function invalidateModeAnalysisRequests() {
  modeAnalysisRequestToken += 1;
}

/**
 * @param {number} token
 */
function isCurrentModeAnalysisRequest(token) {
  return token === modeAnalysisRequestToken;
}

function disposeRouteMapRenderer() {
  routeMapRenderer?.dispose();
  routeMapRenderer = null;
  routeMapRendererPromise = undefined;
}

function getRouteMapRenderer() {
  if (routeMapRenderer) {
    return Promise.resolve(routeMapRenderer);
  }

  routeMapRendererPromise ??= import("./render/map.js").then(({ createRouteMapRenderer }) => {
    routeMapRenderer ??= createRouteMapRenderer();
    return routeMapRenderer;
  });

  return routeMapRendererPromise;
}

function loadPosterRenderer() {
  posterRendererModulePromise ??= Promise.all([
    // @ts-expect-error Vite handles CSS modules at runtime.
    import("./styles/templates.css"),
    // @ts-expect-error Vite handles CSS modules at runtime.
    import("./styles/charts.css"),
    import("./render/templates.js")
  ]).then(([, , templates]) => templates);
  return posterRendererModulePromise;
}

/**
 * @param {Awaited<ReturnType<typeof loadI18n>>} i18n
 */
function renderPreview(i18n) {
  const host = app.querySelector("[data-preview-root]");

  if (!(host instanceof HTMLElement) || !state.parsed || !state.analysis) {
    return;
  }

  void previewRenderer.render(
    host,
    {
      title: state.title,
      mapStyleId: state.mapStyleId,
      dateLabel: state.dateLabel,
      fileName: state.fileName,
      warnings: state.warnings,
      trackLocation: state.trackLocation,
      parsed: state.parsed,
      analysis: state.analysis
    },
    i18n
  );
}

function getSafeLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * @param {{ getItem?: (key: string) => string | null } | null | undefined} storage
 */
function readSavedAnalysisMode(storage) {
  try {
    return normalizePersistedAnalysisMode(storage?.getItem?.(ANALYSIS_MODE_STORAGE_KEY));
  } catch {
    return ANALYSIS_MODES.filtered;
  }
}

/**
 * @param {string} analysisMode
 * @param {{ setItem?: (key: string, value: string) => void } | null | undefined} storage
 */
function saveAnalysisMode(analysisMode, storage) {
  try {
    storage?.setItem?.(ANALYSIS_MODE_STORAGE_KEY, normalizePersistedAnalysisMode(analysisMode));
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}

/**
 * @param {unknown} analysisMode
 */
function normalizePersistedAnalysisMode(analysisMode) {
  const normalizedMode = normalizeAnalysisMode(analysisMode);

  if (typeof normalizedMode === "string" && PERSISTABLE_ANALYSIS_MODES.has(normalizedMode)) {
    return normalizedMode;
  }

  return ANALYSIS_MODES.filtered;
}

/**
 * @param {{ getItem?: (key: string) => string | null } | null | undefined} storage
 */
function readSavedMapStyle(storage) {
  try {
    return normalizeMapStyleId(storage?.getItem?.(MAP_STYLE_STORAGE_KEY));
  } catch {
    return normalizeMapStyleId(null);
  }
}

/**
 * @param {string} mapStyleId
 * @param {{ setItem?: (key: string, value: string) => void } | null | undefined} storage
 */
function saveMapStyle(mapStyleId, storage) {
  try {
    storage?.setItem?.(MAP_STYLE_STORAGE_KEY, normalizeMapStyleId(mapStyleId));
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}

/**
 * @param {string} kind
 */
async function handleExport(kind) {
  activePosterOutputCount += 1;
  const previousErrorCount = state.errors.length;
  clearExportErrors();

  if (state.errors.length !== previousErrorCount) {
    renderApp();
  }

  try {
    const exported = await exportPoster({
      kind,
      root: app,
      fileName: state.fileName,
      templateId: state.templateId,
      previewRenderer
    });

    if (!exported) {
      throw new Error("Export target is not ready");
    }
  } catch {
    state = createState({
      ...state,
      errors: [{ code: "export_error", messageKey: "messages.exportError" }]
    });
    renderApp();
  } finally {
    activePosterOutputCount = Math.max(0, activePosterOutputCount - 1);
    trackLocationController.renderPendingAfterPosterOutput();
  }
}

async function handlePrint() {
  if (printRequestPending) {
    return;
  }

  printRequestPending = true;
  closeOpenSelectorMenus();

  activePosterOutputCount += 1;

  try {
    await previewRenderer.getPendingRenderPromises().poster;

    const node = app.querySelector(".infographic");

    if (!(node instanceof HTMLElement)) {
      return;
    }

    const { chart, map } = previewRenderer.getPendingRenderPromises();
    await Promise.all([chart, map]);

    if (!node.isConnected) {
      return;
    }

    window.print();
  } finally {
    activePosterOutputCount = Math.max(0, activePosterOutputCount - 1);
    printRequestPending = false;
    trackLocationController.renderPendingAfterPosterOutput();
  }
}

function clearExportErrors() {
  const nextErrors = state.errors.filter((error) => error.code !== "export_error");

  if (nextErrors.length === state.errors.length) {
    return;
  }

  state = createState({
    ...state,
    errors: nextErrors
  });
}

/**
 * @param {{ points: { timestamp: Date | null }[] }} parsed
 * @param {string} language
 */
function getDateLabel(parsed, language) {
  const timestamp = parsed.points.find((point) => point.timestamp instanceof Date)?.timestamp;
  return timestamp ? timestamp.toLocaleDateString(language) : "";
}
