const TERRAIN_ELEVATION_PROVIDER_OVERRIDE = "__FRAME_YOUR_TRAIL_TERRAIN_ELEVATION_PROVIDER__";

export const TERRAIN_ELEVATION_PROVIDERS = Object.freeze({
  none: "none",
  openMeteo: "open-meteo"
});

/**
 * @param {unknown} [provider]
 * @returns {"none" | "open-meteo"}
 */
export function getTerrainElevationProvider(provider = getRuntimeProviderOverride()) {
  return provider === TERRAIN_ELEVATION_PROVIDERS.openMeteo
    ? TERRAIN_ELEVATION_PROVIDERS.openMeteo
    : TERRAIN_ELEVATION_PROVIDERS.none;
}

/**
 * @param {unknown} [provider]
 */
export function isTerrainElevationProviderEnabled(provider = getRuntimeProviderOverride()) {
  return getTerrainElevationProvider(provider) !== TERRAIN_ELEVATION_PROVIDERS.none;
}

function getRuntimeProviderOverride() {
  const runtime = /** @type {Record<string, unknown>} */ (globalThis);
  return runtime[TERRAIN_ELEVATION_PROVIDER_OVERRIDE];
}
