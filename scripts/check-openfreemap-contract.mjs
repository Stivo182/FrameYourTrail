import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { VectorTile } from "@mapbox/vector-tile";
import { featureFilter, validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import Pbf from "pbf";

import { DEFAULT_MAP_STYLE_ID, loadMapStyle } from "../src/render/map-styles.js";

const DEFAULT_REQUEST_TIMEOUT_MS = 20000;
const LIBERTY_FIXTURE_PATH = resolve(
  import.meta.dirname,
  "../tests/fixtures/openfreemap-liberty-contract.json"
);
const PROVIDER_FIXTURE_PATH = resolve(
  import.meta.dirname,
  "../tests/fixtures/openfreemap-provider-feature-contract.json"
);
const VECTOR_TILE_GEOMETRY_TYPES = ["Unknown", "Point", "LineString", "Polygon"];
const FILTER_RELEVANT_PROPERTY_KEYS = [
  "class",
  "subclass",
  "name",
  "name_en",
  "name:en",
  "name:latin",
  "rank"
];

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {string} url
 * @param {string} label
 * @param {{ fetcher?: typeof fetch, timeoutMs?: number }} [options]
 */
async function fetchResponse(url, label, options = {}) {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  let didTimeout = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timeout;

  /** @type {Promise<never>} */
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      didTimeout = true;
      controller.abort();
      reject(new Error(`${label} request timed out after ${timeoutMs}ms: ${url}`));
    }, timeoutMs);
  });

  /** @type {Response} */
  let response;

  try {
    response = await Promise.race([fetcher(url, { signal: controller.signal }), timeoutPromise]);
  } catch (error) {
    if (didTimeout) {
      throw new Error(`${label} request timed out after ${timeoutMs}ms: ${url}`);
    }

    throw new Error(`${label} request failed: ${url}: ${formatError(error)}`, { cause: error });
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(`${label} request failed with HTTP ${response.status}${statusText}: ${url}`);
  }

  return response;
}

/**
 * @param {string} url
 * @param {string} label
 * @param {{ fetcher?: typeof fetch, timeoutMs?: number }} [options]
 */
export async function fetchJson(url, label, options = {}) {
  const response = await fetchResponse(url, label, options);

  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${url}: ${formatError(error)}`, {
      cause: error
    });
  }
}

/**
 * @param {string} url
 * @param {string} label
 * @param {{ fetcher?: typeof fetch, timeoutMs?: number }} [options]
 */
async function fetchArrayBuffer(url, label, options = {}) {
  const response = await fetchResponse(url, label, options);

  try {
    return await response.arrayBuffer();
  } catch (error) {
    throw new Error(`${label} returned an unreadable body: ${url}: ${formatError(error)}`, {
      cause: error
    });
  }
}

/**
 * @param {Record<string, unknown>} fixture
 * @param {Record<string, unknown>} liveStyle
 */
export function assertLibertyContract(fixture, liveStyle) {
  const fixtureLayers = Array.isArray(fixture.layers) ? fixture.layers : [];
  const liveLayers = Array.isArray(liveStyle.layers) ? liveStyle.layers : [];
  const fixtureSources = fixture.sources ?? {};
  const liveSources = liveStyle.sources ?? {};
  const errors = [];

  for (const key of Object.keys(fixture)) {
    if (key === "metadata" || key === "sources" || key === "layers") {
      continue;
    }

    if (!isDeepStrictEqual(liveStyle[key], fixture[key])) {
      errors.push(`Liberty top-level field "${key}" changed semantically`);
    }
  }

  for (const [sourceId, expectedSource] of Object.entries(fixtureSources)) {
    if (!Object.hasOwn(liveSources, sourceId)) {
      errors.push(`Liberty source "${sourceId}" disappeared`);
      continue;
    }

    if (!isDeepStrictEqual(liveSources[sourceId], expectedSource)) {
      errors.push(`Liberty source "${sourceId}" changed semantically`);
    }
  }

  const liveLayerIndexById = new Map(
    liveLayers.map((layer, index) => [typeof layer?.id === "string" ? layer.id : "", index])
  );
  const capturedLiveIndexes = [];

  for (const expectedLayer of fixtureLayers) {
    const layerId = expectedLayer?.id;
    const liveIndex = liveLayerIndexById.get(layerId);

    if (liveIndex === undefined) {
      errors.push(`Liberty layer "${String(layerId)}" disappeared`);
      continue;
    }

    capturedLiveIndexes.push({ id: layerId, index: liveIndex });

    if (!isDeepStrictEqual(liveLayers[liveIndex], expectedLayer)) {
      errors.push(`Liberty layer "${String(layerId)}" changed semantically`);
    }
  }

  for (let index = 1; index < capturedLiveIndexes.length; index += 1) {
    const previous = capturedLiveIndexes[index - 1];
    const current = capturedLiveIndexes[index];

    if (previous.index >= current.index) {
      errors.push(
        `captured Liberty layer order changed: "${String(previous.id)}" must precede "${String(current.id)}"`
      );
      break;
    }
  }

  if (errors.length > 0) {
    throw new Error(`OpenFreeMap Liberty contract drift:\n- ${errors.join("\n- ")}`);
  }

  return {
    layerCount: fixtureLayers.length,
    sourceCount: Object.keys(fixtureSources).length
  };
}

function normalizeGeometryType(type) {
  return typeof type === "string" && type.startsWith("Multi") ? type.slice(5) : type;
}

function getRelevantContractProperties(properties) {
  const relevantProperties = {};

  for (const key of FILTER_RELEVANT_PROPERTY_KEYS) {
    if (Object.hasOwn(properties, key)) {
      relevantProperties[key] = properties[key];
    }
  }

  return relevantProperties;
}

/**
 * @param {{ sourceLayer: string, geometryType: string, properties: Record<string, unknown> }} contractFeature
 * @param {{ sourceLayer: string, geometryType: string, properties: Record<string, unknown> }} candidateFeature
 */
export function featureMatchesContract(contractFeature, candidateFeature) {
  if (
    contractFeature.sourceLayer !== candidateFeature.sourceLayer ||
    normalizeGeometryType(contractFeature.geometryType) !==
      normalizeGeometryType(candidateFeature.geometryType)
  ) {
    return false;
  }

  return Object.entries(getRelevantContractProperties(contractFeature.properties)).every(
    ([key, value]) => Object.is(candidateFeature.properties[key], value)
  );
}

function createPosterFeatureFilter(contractFeature, posterStyle) {
  const sampleId = String(contractFeature.id);
  const posterLayerId = contractFeature.posterLayerId;

  if (typeof posterLayerId !== "string" || posterLayerId === "") {
    throw new Error(`provider sample "${sampleId}" has no posterLayerId`);
  }

  const posterLayer = Array.isArray(posterStyle.layers)
    ? posterStyle.layers.find((layer) => layer.id === posterLayerId)
    : undefined;

  if (!posterLayer) {
    throw new Error(
      `provider sample "${sampleId}" target poster layer "${posterLayerId}" is missing`
    );
  }

  if (!Object.hasOwn(posterLayer, "filter") || posterLayer.filter == null) {
    throw new Error(
      `provider sample "${sampleId}" target poster layer "${posterLayerId}" has no filter`
    );
  }

  if (posterLayer["source-layer"] !== contractFeature.sourceLayer) {
    throw new Error(
      `provider sample "${sampleId}" target poster layer "${posterLayerId}" uses source-layer "${String(posterLayer["source-layer"])}" instead of "${contractFeature.sourceLayer}"`
    );
  }

  let compiledFilter;

  try {
    compiledFilter = featureFilter(posterLayer.filter).filter;
  } catch (error) {
    throw new Error(
      `provider sample "${sampleId}" target poster layer "${posterLayerId}" filter could not be compiled: ${formatError(error)}`,
      { cause: error }
    );
  }

  return (candidateFeature) =>
    compiledFilter(
      { zoom: contractFeature.tile.z },
      {
        type: candidateFeature.geometryType,
        properties: candidateFeature.properties
      }
    );
}

/**
 * @param {{ id: string, posterLayerId: string, sourceLayer: string, tile: { z: number } }} contractFeature
 * @param {{ geometryType: string, properties: Record<string, unknown> }} candidateFeature
 * @param {{ layers?: Array<Record<string, unknown>> }} posterStyle
 */
export function featurePassesPosterFilter(contractFeature, candidateFeature, posterStyle) {
  return createPosterFeatureFilter(contractFeature, posterStyle)(candidateFeature);
}

function decodeVectorTile(buffer, requiredSourceLayers) {
  const vectorTile = new VectorTile(new Pbf(buffer));
  const decodedFeatures = [];

  for (const sourceLayer of requiredSourceLayers) {
    const layer = vectorTile.layers[sourceLayer];

    if (!layer) {
      continue;
    }

    for (let featureIndex = 0; featureIndex < layer.length; featureIndex += 1) {
      const feature = layer.feature(featureIndex);
      decodedFeatures.push({
        sourceLayer,
        geometryType: VECTOR_TILE_GEOMETRY_TYPES[feature.type],
        properties: feature.properties
      });
    }
  }

  return decodedFeatures;
}

function getCurrentTileTemplate(tileJson) {
  const template = Array.isArray(tileJson.tiles)
    ? tileJson.tiles.find(
        (candidate) =>
          typeof candidate === "string" &&
          candidate.includes("{z}") &&
          candidate.includes("{x}") &&
          candidate.includes("{y}")
      )
    : undefined;

  if (!template) {
    throw new Error("OpenFreeMap TileJSON does not advertise a {z}/{x}/{y} tile template");
  }

  return template;
}

function expandTileTemplate(template, tile) {
  return template
    .replaceAll("{z}", String(tile.z))
    .replaceAll("{x}", String(tile.x))
    .replaceAll("{y}", String(tile.y));
}

function getTileKey(tile) {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

async function assertProviderContract(providerFixture, tileTemplate, posterStyle, options = {}) {
  const contractFeatures = Array.isArray(providerFixture.features) ? providerFixture.features : [];
  const featuresByTile = new Map();

  for (const contractFeature of contractFeatures) {
    const tileKey = getTileKey(contractFeature.tile);
    const tileGroup = featuresByTile.get(tileKey) ?? {
      tile: contractFeature.tile,
      features: []
    };
    tileGroup.features.push(contractFeature);
    featuresByTile.set(tileKey, tileGroup);
  }

  const failures = [];

  await Promise.all(
    [...featuresByTile.entries()].map(async ([tileKey, tileGroup]) => {
      const tileUrl = expandTileTemplate(tileTemplate, tileGroup.tile);
      const buffer = await fetchArrayBuffer(tileUrl, `vector tile ${tileKey}`, options);
      const requiredSourceLayers = new Set(
        tileGroup.features.map((feature) => feature.sourceLayer)
      );
      const decodedFeatures = decodeVectorTile(buffer, requiredSourceLayers);

      for (const contractFeature of tileGroup.features) {
        let posterFilter;

        try {
          posterFilter = createPosterFeatureFilter(contractFeature, posterStyle);
        } catch (error) {
          failures.push(formatError(error));
          continue;
        }

        const matchingFeatures = decodedFeatures.filter((feature) =>
          featureMatchesContract(contractFeature, feature)
        );

        if (matchingFeatures.length === 0) {
          failures.push(
            `${contractFeature.id} missing from ${tileKey} (${contractFeature.sourceLayer}/${contractFeature.geometryType}, ${JSON.stringify(getRelevantContractProperties(contractFeature.properties))})`
          );
          continue;
        }

        if (!matchingFeatures.some(posterFilter)) {
          failures.push(
            `${contractFeature.id} matched ${tileKey} but was rejected by target poster layer "${contractFeature.posterLayerId}" filter`
          );
        }
      }
    })
  );

  if (failures.length > 0) {
    throw new Error(`OpenFreeMap provider feature contract drift:\n- ${failures.join("\n- ")}`);
  }

  return {
    featureCount: contractFeatures.length,
    tileCount: featuresByTile.size
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function getFixtureUrl(value, label) {
  if (typeof value !== "string" || !value.startsWith("https://")) {
    throw new Error(`${label} fixture URL is missing or is not HTTPS`);
  }

  return value;
}

function formatStyleValidationErrors(errors) {
  return errors.map((error) => error.message ?? String(error)).join("\n- ");
}

export async function runOpenFreeMapContractCheck() {
  const [libertyFixture, providerFixture] = await Promise.all([
    readJson(LIBERTY_FIXTURE_PATH),
    readJson(PROVIDER_FIXTURE_PATH)
  ]);
  const styleUrl = getFixtureUrl(libertyFixture.metadata?.capturedFrom, "Liberty");
  const tileJsonUrl = getFixtureUrl(
    libertyFixture.sources?.openmaptiles?.url,
    "OpenFreeMap TileJSON"
  );
  const [liveStyle, tileJson] = await Promise.all([
    fetchJson(styleUrl, "Liberty style"),
    fetchJson(tileJsonUrl, "TileJSON")
  ]);
  const libertyResult = assertLibertyContract(libertyFixture, liveStyle);
  const posterStyle = await loadMapStyle(DEFAULT_MAP_STYLE_ID, {
    fetcher: async () =>
      new Response(JSON.stringify(liveStyle), {
        headers: { "Content-Type": "application/json" }
      })
  });
  const validationErrors = validateStyleMin(posterStyle);

  if (validationErrors.length > 0) {
    throw new Error(
      `Poster style transformed from live Liberty failed validateStyleMin:\n- ${formatStyleValidationErrors(validationErrors)}`
    );
  }

  const tileTemplate = getCurrentTileTemplate(tileJson);
  const providerResult = await assertProviderContract(providerFixture, tileTemplate, posterStyle);

  console.log(
    `Liberty contract matches ${libertyResult.layerCount} captured layers and ${libertyResult.sourceCount} sources.`
  );
  console.log("Poster transformation of live Liberty passes validateStyleMin.");
  console.log(
    `Provider contract matches ${providerResult.featureCount} features across ${providerResult.tileCount} current tiles.`
  );
  console.log(`Current tile template: ${tileTemplate}`);
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  runOpenFreeMapContractCheck().catch((error) => {
    console.error(`OpenFreeMap live contract check failed:\n${formatError(error)}`);
    process.exitCode = 1;
  });
}
