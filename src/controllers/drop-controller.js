/**
 * @param {{ dataTransfer?: DataTransfer | { types?: Iterable<string> | null } | null, preventDefault: () => void }} event
 */
export function preventInactiveFileDrop(event) {
  if (hasDraggedFiles(event.dataTransfer)) {
    event.preventDefault();
  }
}

/**
 * @param {DataTransfer | { types?: Iterable<string> | null } | null | undefined} dataTransfer
 */
function hasDraggedFiles(dataTransfer) {
  return Array.from(dataTransfer?.types ?? []).includes("Files");
}
