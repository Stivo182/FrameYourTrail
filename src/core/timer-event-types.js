// FIT and GPX timer events use several aliases for moving and stopped states.
const TIMER_START_EVENT_TYPES = new Set(["start", "start_all", "resume", "resume_all"]);
const TIMER_STOP_EVENT_TYPES = new Set([
  "stop",
  "stop_all",
  "pause",
  "stop_disable",
  "stop_disable_all"
]);
/** @type {Readonly<Record<number, string>>} */
const TIMER_EVENT_TYPE_BY_CODE = Object.freeze({
  0: "start",
  1: "stop",
  4: "stop_all",
  8: "stop_disable",
  9: "stop_disable_all"
});

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isTimerStartEventType(value) {
  return typeof value === "string" && TIMER_START_EVENT_TYPES.has(value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isTimerStopEventType(value) {
  return typeof value === "string" && TIMER_STOP_EVENT_TYPES.has(value);
}

/**
 * @param {unknown} value
 * @returns {"start" | "stop" | null}
 */
export function getTimerEventAction(value) {
  if (isTimerStartEventType(value)) {
    return "start";
  }

  if (isTimerStopEventType(value)) {
    return "stop";
  }

  return null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function getTimerEventTypeByCode(value) {
  if (typeof value !== "number") {
    return null;
  }

  return TIMER_EVENT_TYPE_BY_CODE[value] ?? null;
}
