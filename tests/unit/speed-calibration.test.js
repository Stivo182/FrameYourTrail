import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getSpeedProfileCeilingMps,
  getSpeedReliabilityCeilingMps,
  hasSpeedProfile,
  nullableSpeedMpsToKmh,
  speedMpsToKmh
} from "../../src/core/speed-calibration.js";
import {
  classifyMotionSpeedProfile,
  classifySpeedReliabilityProfile
} from "../../src/core/speed-profile.js";

describe("speed calibration", () => {
  it("keeps the motion-profile drift floor in the shared classifier only", () => {
    const cleanerSource = readFileSync(join(process.cwd(), "src/core/track-cleaner.js"), "utf8");
    const profileSource = readFileSync(join(process.cwd(), "src/core/speed-profile.js"), "utf8");

    expect(profileSource).toContain("const SPEED_PROFILE_INFERENCE_MIN_MOVING_SPEED_MPS");
    expect(cleanerSource).not.toContain("const SPEED_PROFILE_INFERENCE_MIN_MOVING_SPEED_MPS");
  });

  it("converts source speeds to user-facing kilometers per hour", () => {
    expect(speedMpsToKmh(10)).toBe(36);
    expect(nullableSpeedMpsToKmh(6)).toBe(21.6);
    expect(nullableSpeedMpsToKmh(null)).toBeNull();
  });

  it("exposes shared speed profile ceilings for cleaning and reliability filtering", () => {
    expect(hasSpeedProfile("slow")).toBe(true);
    expect(hasSpeedProfile("toString")).toBe(false);
    expect(getSpeedProfileCeilingMps("slow")).toBe(6);
    expect(getSpeedProfileCeilingMps("toString")).toBe(50);
    expect(getSpeedReliabilityCeilingMps("slow")).toBe(6);
    expect(getSpeedReliabilityCeilingMps("unknown")).toBeNull();
    expect(getSpeedReliabilityCeilingMps("unrestricted")).toBeNull();
  });

  it("classifies compressed hiking-like reliability as moderate when slow would reject most samples", () => {
    const speedsKmh = [
      ...Array(218).fill(4.58),
      ...Array(326).fill(7.24),
      ...Array(545).fill(22.66),
      ...Array(543).fill(37.77),
      ...Array(544).fill(46.26)
    ];

    const result = classifySpeedReliabilityProfile(speedsKmh, {
      fallbackProfile: "fast"
    });

    expect(result.profile).toBe("moderate");
    expect(result.source).toBe("speed_distribution");
    expect(result.rejectedShareByProfile.slow).toBeGreaterThan(0.5);
    expect(result.warnings).toContain("slow_rejected_share_too_high");
  });

  it("keeps slow reliability for mostly slow tracks with a compressed tail", () => {
    const speedsKmh = [4.5, 5.4, 7.2, 7.6, 8.1, 9.4, 21, 28, 36, 38];

    const result = classifySpeedReliabilityProfile(speedsKmh, {
      fallbackProfile: "unknown"
    });

    expect(result.profile).toBe("slow");
    expect(result.maxReliableSpeedKmh).toBe(21.6);
  });

  it("rejects slow reliability when raw rejected share rounds down to the guard limit", () => {
    const speedsKmh = [...Array(50).fill(4.5), ...Array(51).fill(22)];

    const result = classifySpeedReliabilityProfile(speedsKmh, {
      fallbackProfile: "fast"
    });

    expect(result.rejectedShareByProfile.slow).toBe(0.5);
    expect(result.profile).not.toBe("slow");
    expect(result.warnings).toContain("slow_rejected_share_too_high");
  });

  it("classifies fast motion profile from sustained fast samples", () => {
    const speedsMps = [6.2, 6.4, 9.8, 10.2, 12.9, 22, 24];

    const result = classifyMotionSpeedProfile(speedsMps, undefined);

    expect(result.speedProfile).toBe("fast");
    expect(result.speedProfileSource).toBe("inferred");
    expect(result.adaptiveSpeedCeilingMps).toBe(25);
  });
});
