const LARGE_FILE_BYTES = 50 * 1024 * 1024;

const MESSAGE_KEYS = {
  empty_track: "messages.emptyTrack",
  insufficient_points: "messages.insufficientPoints",
  missing_elevation: "messages.missingElevation",
  missing_time: "messages.missingTime",
  large_file: "messages.largeFile",
  terrain_elevation: "messages.terrainElevation"
};

/**
 * @param {import("./route-source.js").RouteSource} parsed
 * @param {number} fileSizeBytes
 */
export function validateParsedTrack(parsed, fileSizeBytes) {
  const errors = [];
  const warnings = [];

  if (parsed.points.length === 0) {
    errors.push(toMessage("empty_track"));
  }

  if (parsed.points.length === 1) {
    errors.push(toMessage("insufficient_points"));
  }

  if (!parsed.hasElevation) {
    warnings.push(toMessage("missing_elevation"));
  }

  if (parsed.elevationSource === "terrain") {
    warnings.push(toMessage("terrain_elevation"));
  }

  if (!parsed.hasTime) {
    warnings.push(toMessage("missing_time"));
  }

  if (fileSizeBytes >= LARGE_FILE_BYTES) {
    warnings.push(toMessage("large_file"));
  }

  return { errors, warnings };
}

/**
 * @param {keyof typeof MESSAGE_KEYS} code
 */
function toMessage(code) {
  return {
    code,
    messageKey: MESSAGE_KEYS[code]
  };
}
