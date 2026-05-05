import { describe, expect, it } from "vitest";
import {
  evaluateLargeTrackBudget,
  parseLargeTrackBudgetArgs
} from "../../scripts/large-track-budget.mjs";

function createBudgetResult(overrides = {}) {
  return {
    summary: {
      uploadReadMs: { min: 10, median: 15, max: 20 },
      parseAnalyzeMs: { min: 100, median: 150, max: 200 },
      posterRenderMs: { min: 120, median: 180, max: 240 },
      totalMs: { min: 250, median: 350, max: 450 },
      ...overrides
    }
  };
}

describe("large track performance budget", () => {
  it("passes when every summary max value is under the supplied budgets", () => {
    expect(
      evaluateLargeTrackBudget(createBudgetResult(), {
        uploadReadMs: 25,
        parseAnalyzeMs: 250,
        posterRenderMs: 300,
        totalMs: 500
      })
    ).toEqual({ passed: true, exceeded: [] });
  });

  it("fails and reports an exceeded entry when total max is over budget", () => {
    expect(
      evaluateLargeTrackBudget(
        createBudgetResult({ totalMs: { min: 250, median: 350, max: 550 } }),
        {
          uploadReadMs: 25,
          parseAnalyzeMs: 250,
          posterRenderMs: 300,
          totalMs: 500
        }
      )
    ).toEqual({
      passed: false,
      exceeded: [{ metricName: "totalMs", actualMs: 550, budgetMs: 500 }]
    });
  });

  it("parses default benchmark options and positive budgets", () => {
    const options = parseLargeTrackBudgetArgs([]);

    expect(options.pointCount).toBe(1000);
    expect(options.iterations).toBe(1);
    expect(options.warmupIterations).toBe(0);
    expect(options.budgetsMs.uploadReadMs).toBeGreaterThan(0);
    expect(options.budgetsMs.parseAnalyzeMs).toBeGreaterThan(0);
    expect(options.budgetsMs.posterRenderMs).toBeGreaterThan(0);
    expect(options.budgetsMs.totalMs).toBeGreaterThan(0);
  });

  it("parses benchmark and budget CLI arguments", () => {
    expect(
      parseLargeTrackBudgetArgs([
        "--points",
        "1500",
        "--iterations",
        "2",
        "--warmup",
        "1",
        "--max-upload-read-ms",
        "300",
        "--max-parse-analyze-ms",
        "2600",
        "--max-poster-render-ms",
        "2700",
        "--max-total-ms",
        "5600"
      ])
    ).toEqual({
      pointCount: 1500,
      iterations: 2,
      warmupIterations: 1,
      budgetsMs: {
        uploadReadMs: 300,
        parseAnalyzeMs: 2600,
        posterRenderMs: 2700,
        totalMs: 5600
      }
    });
  });
});
