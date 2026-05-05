import { fileURLToPath } from "node:url";

import {
  formatLargeTrackBenchmarkReport,
  parseLargeTrackBenchmarkArgs,
  runLargeTrackBenchmark
} from "./large-track-benchmark.mjs";

export const DEFAULT_LARGE_TRACK_BUDGETS_MS = {
  uploadReadMs: 250,
  parseAnalyzeMs: 2500,
  posterRenderMs: 2500,
  totalMs: 5000
};

const DEFAULT_BENCHMARK_ARGS = ["--points", "1000", "--iterations", "1", "--warmup", "0"];

const BUDGET_FLAGS = new Map([
  ["--max-upload-read-ms", "uploadReadMs"],
  ["--max-parse-analyze-ms", "parseAnalyzeMs"],
  ["--max-poster-render-ms", "posterRenderMs"],
  ["--max-total-ms", "totalMs"]
]);

/**
 * @param {string[]} args
 * @returns {{
 *   pointCount: number,
 *   iterations: number,
 *   warmupIterations: number,
 *   budgetsMs: Record<string, number>
 * }}
 */
export function parseLargeTrackBudgetArgs(args) {
  const benchmarkArgs = [];
  const budgetsMs = { ...DEFAULT_LARGE_TRACK_BUDGETS_MS };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const budgetMetricName = BUDGET_FLAGS.get(arg);

    if (budgetMetricName) {
      const value = args[index + 1];

      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${arg} requires a positive millisecond value.`);
      }

      budgetsMs[budgetMetricName] = parsePositiveMillisecondArgument(value, arg);
      index += 1;
      continue;
    }

    benchmarkArgs.push(arg);
  }

  const { pointCount, iterations, warmupIterations } = parseLargeTrackBenchmarkArgs([
    ...DEFAULT_BENCHMARK_ARGS,
    ...benchmarkArgs
  ]);

  return { pointCount, iterations, warmupIterations, budgetsMs };
}

/**
 * @param {{ summary: Record<string, { max: number }> }} result
 * @param {Record<string, number>} budgetsMs
 * @returns {{ passed: boolean, exceeded: Array<{ metricName: string, actualMs: number, budgetMs: number }> }}
 */
export function evaluateLargeTrackBudget(result, budgetsMs) {
  const exceeded = Object.entries(budgetsMs)
    .filter(([metricName, budgetMs]) => result.summary[metricName]?.max > budgetMs)
    .map(([metricName, budgetMs]) => ({
      metricName,
      actualMs: result.summary[metricName].max,
      budgetMs
    }));

  return { passed: exceeded.length === 0, exceeded };
}

/**
 * @param {string} value
 * @param {string} flag
 */
function parsePositiveMillisecondArgument(value, flag) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive millisecond value.`);
  }

  return parsed;
}

async function main() {
  try {
    const options = parseLargeTrackBudgetArgs(process.argv.slice(2));
    const result = await runLargeTrackBenchmark(options);
    const budgetResult = evaluateLargeTrackBudget(result, options.budgetsMs);

    console.log(formatLargeTrackBenchmarkReport(result));

    if (budgetResult.passed) {
      console.log("Large track performance budget passed.");
      return;
    }

    for (const exceeded of budgetResult.exceeded) {
      console.error(
        `Large track performance budget exceeded for ${exceeded.metricName}: ${exceeded.actualMs.toFixed(2)} ms > ${exceeded.budgetMs.toFixed(2)} ms.`
      );
    }

    process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
