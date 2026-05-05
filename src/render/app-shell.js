import { LANGUAGE_OPTIONS } from "../i18n/index.js";
import { MAP_STYLE_OPTIONS, normalizeMapStyleId } from "./map-styles.js";

/**
 * @typedef {object} I18nLike
 * @property {string} language
 * @property {(key: string) => string} t
 */

/**
 * @param {{
 *   i18n: I18nLike,
 *   hasPoster: boolean,
 *   analysisModeSelectHtml: string,
 *   mapStyleSelectHtml: string,
 *   exportControlsHtml: string,
 *   languageSelectHtml: string,
 *   messagesHtml: string,
 *   contentHtml: string
 * }} options
 */
export function renderAppShell({
  i18n,
  hasPoster,
  analysisModeSelectHtml,
  mapStyleSelectHtml,
  exportControlsHtml,
  languageSelectHtml,
  messagesHtml,
  contentHtml
}) {
  return `
    <main class="app-shell${hasPoster ? " app-shell--has-poster" : ""}">
      <section class="toolbar" aria-label="${escapeHtml(i18n.t("site.toolbarLabel"))}">
        <div class="toolbar__identity">
          <h1>Frame Your Trail</h1>
          <p class="toolbar__tagline">${escapeHtml(i18n.t("site.tagline"))}</p>
        </div>
        <div class="toolbar__actions">
          <label class="upload-box">
            <input data-file-input type="file" accept=".gpx,.tcx,.fit,application/gpx+xml,application/vnd.garmin.tcx+xml,application/xml,text/xml,application/octet-stream" />
            <span>${escapeHtml(i18n.t("site.uploadFile"))}</span>
          </label>
          ${analysisModeSelectHtml}
          ${mapStyleSelectHtml}
          ${exportControlsHtml}
          ${languageSelectHtml}
        </div>
      </section>
      ${messagesHtml}
      ${contentHtml}
    </main>
  `;
}

/**
 * @param {{ errors: import("../state/app-state.js").AppMessage[], warnings: import("../state/app-state.js").AppMessage[] }} stateMessages
 * @param {I18nLike} i18n
 */
export function renderMessages({ errors, warnings }, i18n) {
  const messages = [
    ...errors.map((item) => ({ ...item, level: "error" })),
    ...warnings.map((item) => ({ ...item, level: "warning" }))
  ];

  if (messages.length === 0) {
    return "";
  }

  const hasErrors = messages.some((item) => item.level === "error");
  const liveRegionRole = hasErrors ? "alert" : "status";

  return `
    <section class="messages" role="${liveRegionRole}">
      ${messages
        .map(
          (item) =>
            `<p class="message message--${item.level}">${escapeHtml(getMessageText(item, i18n))}</p>`
        )
        .join("")}
    </section>
  `;
}

/**
 * @param {{ message?: string, messageKey?: string }} item
 * @param {I18nLike} i18n
 */
function getMessageText(item, i18n) {
  return item.messageKey ? i18n.t(item.messageKey) : (item.message ?? "");
}

/**
 * @param {I18nLike} i18n
 * @param {string} selectedMapStyleId
 */
export function renderMapStyleSelect(i18n, selectedMapStyleId) {
  const selectedId = normalizeMapStyleId(selectedMapStyleId);
  const selectedStyle =
    MAP_STYLE_OPTIONS.find((option) => option.id === selectedId) ?? MAP_STYLE_OPTIONS[0];
  const selectLabel = i18n.t("mapStyle.selectLabel");
  const selectedLabel = i18n.t(selectedStyle.labelKey);
  const summaryLabel = `${selectLabel}: ${selectedLabel}`;

  return `
    <details class="map-style-menu" data-map-style-menu>
      <summary title="${escapeHtml(selectLabel)}" aria-label="${escapeHtml(summaryLabel)}">
        <span class="map-style-menu__prefix">${escapeHtml(selectLabel)}:</span>
        <span class="map-style-menu__value">${escapeHtml(selectedLabel)}</span>
      </summary>
      <fieldset class="map-style-menu__panel">
        <legend>${escapeHtml(selectLabel)}</legend>
        ${MAP_STYLE_OPTIONS.map((option) => renderMapStyleOption(option, selectedId, i18n)).join("")}
      </fieldset>
    </details>
  `;
}

/**
 * @param {(typeof MAP_STYLE_OPTIONS)[number]} option
 * @param {string} selectedId
 * @param {I18nLike} i18n
 */
function renderMapStyleOption(option, selectedId, i18n) {
  return `
    <label class="map-style-menu__option">
      <input
        type="radio"
        name="map-style"
        value="${escapeHtml(option.id)}"
        data-map-style-option
        ${option.id === selectedId ? "checked" : ""}
      />
      <span class="map-style-menu__copy">
        <span class="map-style-menu__label">${escapeHtml(i18n.t(option.labelKey))}</span>
        <span class="map-style-menu__description">${escapeHtml(i18n.t(option.descriptionKey))}</span>
      </span>
    </label>
  `;
}

/**
 * @param {I18nLike} i18n
 */
export function renderEmptyState(i18n) {
  return `
    <section class="empty-state" data-testid="empty-state" data-drop-zone>
      <h2>${escapeHtml(i18n.t("site.emptyTitle"))}</h2>
      <p>${escapeHtml(i18n.t("site.emptyBody"))}</p>
    </section>
  `;
}

export function renderWorkspaceShell() {
  return `
    <section class="workspace">
      <div class="poster-scroll">
        <div class="poster-preview-frame" data-poster-preview-frame>
          <div class="poster-preview-scale" data-preview-root></div>
        </div>
      </div>
    </section>
  `;
}

/**
 * @param {I18nLike} i18n
 * @param {{ clipboardSupported?: boolean }} [options]
 */
export function renderExportControls(i18n, options = {}) {
  const clipboardSupported = options.clipboardSupported ?? true;
  const exportLabel = trimTrailingColon(i18n.t("site.exportLabel"));
  const exportAria = i18n.t("site.exportAria");
  const clipboardExportHtml = clipboardSupported
    ? `<button class="export-menu__option" type="button" data-export="clipboard">${escapeHtml(i18n.t("site.clipboard"))}</button>`
    : "";

  return `
    <details class="export-menu" data-export-menu>
      <summary title="${escapeHtml(exportAria)}" aria-label="${escapeHtml(exportAria)}">
        <span class="export-menu__label">${escapeHtml(exportLabel)}</span>
      </summary>
      <div class="export-menu__panel">
        <button class="export-menu__option" type="button" data-export="png">PNG</button>
        <button class="export-menu__option" type="button" data-export="jpeg">JPG</button>
        <button class="export-menu__option" type="button" data-export="pdf">PDF</button>
        ${clipboardExportHtml}
      </div>
    </details>
  `;
}

/**
 * @param {I18nLike} i18n
 */
export function renderLanguageSelect(i18n) {
  const selectedLanguage =
    LANGUAGE_OPTIONS.find((option) => option.code === i18n.language) ?? LANGUAGE_OPTIONS[0];
  const languageLabel = i18n.t("site.languageLabel");
  const selectedLanguageCode = selectedLanguage.code.toUpperCase();
  const languageSummaryLabel = `${languageLabel}: ${selectedLanguageCode} ${selectedLanguage.label}`;

  return `
    <details class="language-menu" data-language-menu>
      <summary title="${escapeHtml(languageLabel)}" aria-label="${escapeHtml(languageSummaryLabel)}">
        <span class="language-menu__prefix">${escapeHtml(selectedLanguageCode)}</span>
      </summary>
      <fieldset class="language-menu__panel">
        <legend>${escapeHtml(languageLabel)}</legend>
        ${LANGUAGE_OPTIONS.map((option) => renderLanguageOption(option, i18n.language)).join("")}
      </fieldset>
    </details>
  `;
}

/**
 * @param {{ code: string, label: string }} option
 * @param {string} selectedLanguage
 */
function renderLanguageOption(option, selectedLanguage) {
  return `
    <label class="language-menu__option">
      <input
        type="radio"
        name="language"
        value="${escapeHtml(option.code)}"
        data-language-option
        ${option.code === selectedLanguage ? "checked" : ""}
      />
      <span class="language-menu__label">${escapeHtml(option.label)}</span>
    </label>
  `;
}

/**
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * @param {string} value
 */
function trimTrailingColon(value) {
  return value.replace(/:\s*$/, "");
}
