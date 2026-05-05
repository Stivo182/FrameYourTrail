import { describe, expect, it } from "vitest";

import {
  getMovingThresholds,
  MOVING_SPEED_THRESHOLDS_BY_PROFILE
} from "../../src/core/track-moving-time.js";

describe("track moving time policy", () => {
  it("keeps inferred slow tracks on default walking thresholds", () => {
    expect(
      getMovingThresholds({ speedProfile: "slow", speedProfileSource: "inferred" })
    ).toMatchObject({
      speedProfile: "slow",
      onSpeedKmh: 1.5,
      offSpeedKmh: 0.8
    });
  });

  it("keeps explicit slow tracks more sensitive", () => {
    expect(
      getMovingThresholds({ speedProfile: "slow", speedProfileSource: "explicit" })
    ).toMatchObject({
      onSpeedKmh: 1.2,
      offSpeedKmh: 0.5
    });
  });

  it("exports the moving threshold policy for diagnostics and calibration review", () => {
    expect(MOVING_SPEED_THRESHOLDS_BY_PROFILE.fast).toEqual({
      onSpeedKmh: 3,
      offSpeedKmh: 1.5
    });
  });

  it("freezes exported moving threshold records", () => {
    expect(Object.isFrozen(MOVING_SPEED_THRESHOLDS_BY_PROFILE.fast)).toBe(true);
    expect(Object.isFrozen(MOVING_SPEED_THRESHOLDS_BY_PROFILE.slow)).toBe(true);
  });
});
