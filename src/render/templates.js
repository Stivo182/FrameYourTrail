import { createI18n } from "../i18n/index.js";
import { icon } from "./icons.js";
import { getMetricDisplayItems } from "./metric-display.js";
import { TEMPLATE_DEFINITIONS, THEMES } from "./template-definitions.js";

/**
 * @typedef {object} InfographicModel
 * @property {string} title
 * @property {string} dateLabel
 * @property {string | undefined} fileName
 * @property {{ label: string } | null | undefined} [trackLocation]
 * @property {(string | { message?: string, messageKey?: string })[]} warnings
 * @property {Record<string, unknown>} analysis
 * @property {{ points?: unknown[] }} parsed
 */

/**
 * @param {InfographicModel} model
 * @param {ReturnType<typeof createI18n>} [i18n]
 * @returns {HTMLElement}
 */
export function renderInfographic(model, i18n = createI18n("en")) {
  const definition = TEMPLATE_DEFINITIONS[0];
  const theme = THEMES[0].id;
  const article = document.createElement("article");
  const pointSummary = getPointSummary(model.parsed.points?.length ?? 0, i18n);
  const trackPeriodLabel = getTrackPeriodLabel(model.parsed.points, i18n.language);
  const representativeCoordinate = getRepresentativeCoordinate(model.parsed.points);
  const locationLabel = getLocationLabel(model.trackLocation);

  article.className = `infographic infographic--${definition.id} theme-${theme}`;
  article.dataset.template = definition.id;
  article.dataset.analysisMode = String(model.analysis.mode ?? "");
  article.setAttribute("data-poster-background-art", "");
  article.style.setProperty("--poster-width", `${definition.width}px`);
  article.style.setProperty("--poster-height", `${definition.height}px`);
  article.innerHTML = `
    <header class="infographic__header poster-header">
      <div class="poster-header__copy">
        <h2>${escapeHtml(model.title)}</h2>
        ${renderTrackPeriod(trackPeriodLabel)}
        ${renderLocation(locationLabel)}
      </div>
      ${renderCoordinates(representativeCoordinate, i18n)}
    </header>
    <div class="infographic__body poster-body">
      <section class="map-panel poster-map" data-map-slot aria-label="${escapeHtml(i18n.t("poster.mapAria"))}">
        <div class="map-panel__grid"></div>
        <div class="map-panel__track"></div>
        <p>${escapeHtml(pointSummary)}</p>
      </section>
      <section class="elevation-section" aria-labelledby="elevation-profile-title">
        <h3 class="section-title elevation-section__title" id="elevation-profile-title">${escapeHtml(i18n.t("poster.elevationTitle"))}</h3>
        <div class="chart-slot chart-slot--elevation elevation-landscape" data-chart="elevation"></div>
      </section>
      <section class="stats-panel poster-stats" aria-label="${escapeHtml(i18n.t("poster.statsAria"))}">
        ${renderMetrics(model.analysis, i18n)}
      </section>
    </div>
  `;

  return article;
}

/**
 * @param {unknown[] | undefined} points
 * @returns {{ latitude: number, longitude: number } | null}
 */
function getRepresentativeCoordinate(points) {
  const coordinates = Array.isArray(points) ? points.map(getPointCoordinate).filter(Boolean) : [];

  return coordinates.length > 0 ? coordinates[Math.floor(coordinates.length / 2)] : null;
}

/**
 * @param {unknown} point
 * @returns {{ latitude: number, longitude: number } | null}
 */
function getPointCoordinate(point) {
  if (!point || typeof point !== "object") {
    return null;
  }

  const { latitude, longitude } = /** @type {{ latitude?: unknown, longitude?: unknown }} */ (
    point
  );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude === 0 ||
    longitude === 0
  ) {
    return null;
  }

  return {
    latitude: /** @type {number} */ (latitude),
    longitude: /** @type {number} */ (longitude)
  };
}

/**
 * @param {{ latitude: number, longitude: number } | null} coordinate
 * @param {ReturnType<typeof createI18n>} i18n
 * @returns {string}
 */
function renderCoordinates(coordinate, i18n) {
  if (!coordinate) {
    return "";
  }

  return `
      <aside class="poster-header__coordinates" aria-label="${escapeHtml(i18n.t("poster.coordinatesAria"))}">
        <span class="poster-header__coordinate">
          <span class="poster-header__coordinate-value">${escapeHtml(formatCoordinate(coordinate.latitude, "latitude", i18n.language))}</span>
        </span>
        <span class="poster-header__coordinate">
          <span class="poster-header__coordinate-value">${escapeHtml(formatCoordinate(coordinate.longitude, "longitude", i18n.language))}</span>
        </span>
      </aside>`;
}

/**
 * @param {number} value
 * @param {"latitude" | "longitude"} axis
 * @param {string} language
 * @returns {string}
 */
function formatCoordinate(value, axis, language) {
  const number = new Intl.NumberFormat(language, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
    useGrouping: false
  }).format(Math.abs(value));
  const hemisphere = axis === "latitude" ? (value < 0 ? "S" : "N") : value < 0 ? "W" : "E";

  return `${number}° ${hemisphere}`;
}

/**
 * @param {unknown[] | undefined} points
 * @param {string} language
 * @returns {string}
 */
function getTrackPeriodLabel(points, language) {
  const timestamps = Array.isArray(points)
    ? points.map(getPointTimestamp).filter((timestamp) => timestamp instanceof Date)
    : [];

  if (timestamps.length === 0) {
    return "";
  }

  const start = new Date(Math.min(...timestamps.map((timestamp) => timestamp.getTime())));
  const end = new Date(Math.max(...timestamps.map((timestamp) => timestamp.getTime())));

  return formatTrackDateRange(start, end, language);
}

/**
 * @param {unknown} point
 * @returns {Date | null}
 */
function getPointTimestamp(point) {
  if (!point || typeof point !== "object" || !("timestamp" in point)) {
    return null;
  }

  const timestamp = /** @type {{ timestamp?: unknown }} */ (point).timestamp;
  return timestamp instanceof Date && Number.isFinite(timestamp.getTime()) ? timestamp : null;
}

/**
 * @param {Date} start
 * @param {Date} end
 * @param {string} language
 * @returns {string}
 */
function formatTrackDateRange(start, end, language) {
  const startParts = getUtcCalendarParts(start);
  const endParts = getUtcCalendarParts(end);

  if (
    startParts.year === endParts.year &&
    startParts.month === endParts.month &&
    startParts.day === endParts.day
  ) {
    return formatTrackDate(start, language);
  }

  if (startParts.year === endParts.year && startParts.month === endParts.month) {
    return formatTrackDate(end, language, `${startParts.day}-${endParts.day}`);
  }

  if (startParts.year === endParts.year) {
    return `${formatTrackDate(start, language, null, false)} - ${formatTrackDate(end, language)}`;
  }

  return `${formatTrackDate(start, language)} - ${formatTrackDate(end, language)}`;
}

/**
 * @param {Date} date
 */
function getUtcCalendarParts(date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate()
  };
}

/**
 * @param {Date} date
 * @param {string} language
 * @param {string | null} [dayOverride]
 * @param {boolean} [includeYear]
 * @returns {string}
 */
function formatTrackDate(date, language, dayOverride = null, includeYear = true) {
  const formatter = new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" } : {}),
    timeZone: "UTC"
  });
  const parts = formatter
    .formatToParts(date)
    .filter((part) => part.type !== "era")
    .map((part) => (part.type === "day" && dayOverride ? { ...part, value: dayOverride } : part));

  while (parts.at(-1)?.type === "literal") {
    parts.pop();
  }

  return parts
    .map((part) => part.value)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} label
 * @returns {string}
 */
function renderTrackPeriod(label) {
  if (!label) {
    return "";
  }

  return `
        <p class="poster-header__period">${escapeHtml(label)}</p>`;
}

/**
 * @param {{ label: string } | null | undefined} trackLocation
 * @returns {string}
 */
function getLocationLabel(trackLocation) {
  return typeof trackLocation?.label === "string" ? trackLocation.label.trim() : "";
}

/**
 * @param {string} label
 * @returns {string}
 */
function renderLocation(label) {
  if (!label) {
    return "";
  }

  return `
        <p class="poster-header__location">
          ${icon("location")}
          <span>${escapeHtml(label)}</span>
        </p>`;
}

/**
 * @param {Record<string, unknown>} analysis
 * @param {ReturnType<typeof createI18n>} i18n
 * @returns {string}
 */
function renderMetrics(analysis, i18n) {
  const items = getMetricDisplayItems(analysis, i18n);
  const rows = [];

  for (let index = 0; index < items.length; index += 4) {
    rows.push(items.slice(index, index + 4));
  }

  return `
    <div class="metric-table">
      ${rows
        .map((row) => {
          return `
        <div class="metric-table__row">
          ${row
            .map((item) => {
              return `
            <article class="metric-table__cell" data-metric="${escapeHtml(item.id)}">
              <span class="metric-table__icon">${icon(item.iconName)}</span>
              <span class="metric-table__label">${escapeHtml(item.label)}</span>
              <strong class="metric-table__value">${escapeHtml(item.formattedValue)}</strong>
            </article>
          `;
            })
            .join("")}
        </div>
      `;
        })
        .join("")}
    </div>
  `;
}

/**
 * @param {number} count
 * @param {ReturnType<typeof createI18n>} i18n
 * @returns {string}
 */
function getPointSummary(count, i18n) {
  return i18n.tPlural("poster.pointSummary", count, { count });
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
