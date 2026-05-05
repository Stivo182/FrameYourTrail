import { DEFAULT_LANGUAGE, LANGUAGE_OPTIONS, SUPPORTED_LANGUAGES } from "./metadata.js";
import en from "./locales/en.js";

export { DEFAULT_LANGUAGE, LANGUAGE_OPTIONS, SUPPORTED_LANGUAGES };

export const STORAGE_KEY = "frame-your-trail-language";
const DEFAULT_LOCALES = Object.freeze({ [DEFAULT_LANGUAGE]: en });

const localeLoaders = Object.freeze({
  en: () => Promise.resolve(en),
  ru: () => import("./locales/ru.js").then((module) => module.default),
  es: () => import("./locales/es.js").then((module) => module.default),
  fr: () => import("./locales/fr.js").then((module) => module.default),
  de: () => import("./locales/de.js").then((module) => module.default)
});

const localeCache = new Map([[DEFAULT_LANGUAGE, en]]);

/**
 * @param {string} language
 */
export function isLocaleLoaded(language) {
  const normalized = normalizeLanguage(language) ?? DEFAULT_LANGUAGE;
  return localeCache.has(normalized);
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeLanguage(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const base = value.trim().toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.includes(base) ? base : null;
}

/**
 * @param {{ getItem?: (key: string) => string | null } | null | undefined} storage
 */
export function readSavedLanguage(storage) {
  try {
    return normalizeLanguage(storage?.getItem?.(STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * @param {string} language
 * @param {{ setItem?: (key: string, value: string) => void } | null | undefined} storage
 */
export function saveLanguage(language, storage) {
  const normalized = normalizeLanguage(language);
  if (!normalized) {
    return;
  }

  try {
    storage?.setItem?.(STORAGE_KEY, normalized);
  } catch {
    // Persistence is best-effort; the active session can still use the language.
  }
}

/**
 * @param {{ languages?: readonly string[], language?: string } | null | undefined} navigatorLike
 * @param {{ getItem?: (key: string) => string | null } | null | undefined} storage
 */
export function resolveInitialLanguage(navigatorLike, storage) {
  const saved = readSavedLanguage(storage);
  if (saved) {
    return saved;
  }

  const candidates = [
    ...(Array.isArray(navigatorLike?.languages) ? navigatorLike.languages : []),
    navigatorLike?.language
  ];

  for (const candidate of candidates) {
    const normalized = normalizeLanguage(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return DEFAULT_LANGUAGE;
}

/**
 * @param {string} language
 */
export async function loadLocale(language) {
  const normalized = normalizeLanguage(language) ?? DEFAULT_LANGUAGE;
  const cached = localeCache.get(normalized);

  if (cached) {
    return cached;
  }

  const loader = localeLoaders[normalized] ?? localeLoaders[DEFAULT_LANGUAGE];
  const locale = await loader();
  localeCache.set(normalized, locale);
  return locale;
}

/**
 * @param {string} language
 */
export async function loadI18n(language) {
  const activeLanguage = normalizeLanguage(language) ?? DEFAULT_LANGUAGE;

  try {
    const locale = await loadLocale(activeLanguage);
    return createI18n(activeLanguage, createLocaleMap(activeLanguage, locale));
  } catch {
    return createI18n(activeLanguage, createLocaleMap(activeLanguage, en), {
      pluralLanguage: DEFAULT_LANGUAGE
    });
  }
}

/**
 * @param {string} language
 */
export function createCachedI18n(language) {
  const activeLanguage = normalizeLanguage(language) ?? DEFAULT_LANGUAGE;
  const cachedLocale = localeCache.get(activeLanguage);

  return createI18n(activeLanguage, createLocaleMap(activeLanguage, cachedLocale ?? en), {
    pluralLanguage: cachedLocale ? activeLanguage : DEFAULT_LANGUAGE
  });
}

/**
 * @param {string} language
 * @param {Record<string, unknown>} [locales]
 * @param {{ pluralLanguage?: string }} [options]
 */
export function createI18n(language, locales = DEFAULT_LOCALES, options = {}) {
  const requestedLanguage = normalizeLanguage(language) ?? DEFAULT_LANGUAGE;
  const activeLanguage = locales[requestedLanguage] ? requestedLanguage : DEFAULT_LANGUAGE;
  const pluralLanguage = normalizeLanguage(options.pluralLanguage) ?? activeLanguage;
  const pluralRules = new Intl.PluralRules(pluralLanguage);

  return {
    language: activeLanguage,
    locale: locales[activeLanguage] ?? locales[DEFAULT_LANGUAGE],
    t: (key, values = {}) => interpolate(resolveTranslation(locales, activeLanguage, key), values),
    tPlural: (key, count, values = {}) =>
      interpolate(
        resolvePluralTranslation(locales, activeLanguage, key, pluralRules.select(count)),
        {
          ...values,
          count
        }
      )
  };
}

/**
 * @param {string} language
 * @param {Record<string, unknown>} locale
 */
function createLocaleMap(language, locale) {
  return language === DEFAULT_LANGUAGE
    ? DEFAULT_LOCALES
    : {
        ...DEFAULT_LOCALES,
        [language]: locale
      };
}

/**
 * @param {Record<string, unknown>} locale
 */
export function getLocaleKeys(locale) {
  return flattenKeys(locale).sort();
}

/**
 * @param {Record<string, unknown>} locales
 * @param {string} language
 * @param {string} key
 */
function resolveTranslation(locales, language, key) {
  return getByPath(locales[language], key) ?? getByPath(locales[DEFAULT_LANGUAGE], key) ?? key;
}

/**
 * @param {Record<string, unknown>} locales
 * @param {string} language
 * @param {string} key
 * @param {string} category
 */
function resolvePluralTranslation(locales, language, key, category) {
  return (
    getByPath(locales[language], `${key}.${category}`) ??
    getByPath(locales[language], `${key}.other`) ??
    getByPath(locales[DEFAULT_LANGUAGE], `${key}.${category}`) ??
    getByPath(locales[DEFAULT_LANGUAGE], `${key}.other`) ??
    key
  );
}

/**
 * @param {unknown} template
 * @param {Record<string, unknown>} values
 */
function interpolate(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : `{${name}}`
  );
}

/**
 * @param {unknown} source
 * @param {string} key
 */
function getByPath(source, key) {
  return key.split(".").reduce((value, part) => value?.[part], source);
}

/**
 * @param {unknown} value
 * @param {string} [prefix]
 * @returns {string[]}
 */
function flattenKeys(value, prefix = "") {
  if (!value || typeof value !== "object") {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key)
  );
}
