import { describe, expect, it } from "vitest";

import {
  getTimerEventAction,
  getTimerEventTypeByCode,
  isTimerStartEventType,
  isTimerStopEventType
} from "../../src/core/timer-event-types.js";

describe("timer event types", () => {
  it("classifies timer event aliases", () => {
    expect(isTimerStartEventType("start")).toBe(true);
    expect(isTimerStartEventType("resume_all")).toBe(true);
    expect(isTimerStopEventType("stop")).toBe(true);
    expect(isTimerStopEventType("stop_disable_all")).toBe(true);
    expect(isTimerStartEventType("stop")).toBe(false);
    expect(isTimerStopEventType("start")).toBe(false);
  });

  it("normalizes timer event actions", () => {
    expect(getTimerEventAction("resume")).toBe("start");
    expect(getTimerEventAction("pause")).toBe("stop");
    expect(getTimerEventAction("unknown")).toBeNull();
    expect(getTimerEventAction(42)).toBeNull();
  });

  it("maps FIT event type codes to canonical event type names", () => {
    expect(getTimerEventTypeByCode(0)).toBe("start");
    expect(getTimerEventTypeByCode(1)).toBe("stop");
    expect(getTimerEventTypeByCode(4)).toBe("stop_all");
    expect(getTimerEventTypeByCode(8)).toBe("stop_disable");
    expect(getTimerEventTypeByCode(9)).toBe("stop_disable_all");
    expect(getTimerEventTypeByCode(99)).toBeNull();
  });
});
