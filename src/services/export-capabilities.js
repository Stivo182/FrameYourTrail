/**
 * @param {{
 *   ClipboardItem?: unknown,
 *   navigator?: { clipboard?: { write?: unknown } }
 * }} [environment]
 */
export function supportsClipboardImage(environment = globalThis) {
  if (
    typeof environment.ClipboardItem !== "function" ||
    typeof environment.navigator?.clipboard?.write !== "function"
  ) {
    return false;
  }

  const clipboardItem = /** @type {{ supports?: unknown }} */ (environment.ClipboardItem);

  return typeof clipboardItem.supports === "function"
    ? clipboardItem.supports("image/png") === true
    : true;
}
