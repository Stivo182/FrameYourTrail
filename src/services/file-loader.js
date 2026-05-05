import { ROUTE_FORMATS } from "../core/route-source.js";
import { getTrackSourceFormat, isSupportedTrackSourceFile } from "../core/track-source-format.js";

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function readTextFile(file) {
  if (typeof file.text === "function") {
    return file.text();
  }

  const result = await readBlobWithFileReader(file, "text");
  return typeof result === "string" ? result : new TextDecoder().decode(result);
}

/**
 * @param {File} file
 * @returns {Promise<string | ArrayBuffer>}
 */
export async function readTrackSourceFile(file) {
  if (getTrackSourceFormat(file.name, file.type) !== ROUTE_FORMATS.fit) {
    return readTextFile(file);
  }

  return typeof file.arrayBuffer === "function"
    ? file.arrayBuffer()
    : readBlobWithFileReader(file, "arrayBuffer");
}

/**
 * @param {Blob} file
 * @param {"text" | "arrayBuffer"} mode
 * @returns {Promise<string | ArrayBuffer>}
 */
function readBlobWithFileReader(file, mode) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string" || reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error("File could not be read"));
      }
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("File read failed")));

    if (mode === "text") {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}

/**
 * @param {File | null | undefined} file
 * @returns {file is File}
 */
export function isSupportedTrackFile(file) {
  return isSupportedTrackSourceFile(file);
}
