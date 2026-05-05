import { readFile } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("lazy module boundaries", () => {
  it("loads poster renderer and poster-only styles dynamically after upload", async () => {
    const mainSource = await readFile(join(process.cwd(), "src/main.js"), "utf8");
    const staticImportSpecifiers = getStaticImportSpecifiers(mainSource);
    const reachableModules = await getReachableStaticModules("src/main.js");

    expect(staticImportSpecifiers).not.toContain("./render/templates.js");
    expect(staticImportSpecifiers).not.toContain("./styles/templates.css");
    expect(staticImportSpecifiers).not.toContain("./styles/charts.css");
    expect(reachableModules).not.toContain(normalize("src/render/templates.js"));
    expect(reachableModules).not.toContain(normalize("src/render/icons.js"));
    expect(reachableModules).not.toContain(normalize("src/core/formatters.js"));
    expect(mainSource).toContain('import("./render/templates.js")');
    expect(mainSource).toContain('import("./styles/templates.css")');
    expect(mainSource).toContain('import("./styles/charts.css")');
  });

  it("loads visible elevation chart rendering dynamically from the main app module", async () => {
    const mainSource = await readFile(join(process.cwd(), "src/main.js"), "utf8");
    const previewRendererSource = await readFile(
      join(process.cwd(), "src/render/preview-renderer.js"),
      "utf8"
    );
    const staticImportSpecifiers = getStaticImportSpecifiers(mainSource);

    expect(staticImportSpecifiers).not.toContain("./render/charts.js");
    expect(staticImportSpecifiers).not.toContain("./render/elevation-chart.js");
    expect(previewRendererSource).toContain('import("./elevation-chart.js")');
  });

  it("keeps MapLibre CSS out of the initial app stylesheet", async () => {
    const mainSource = await readFile(join(process.cwd(), "src/main.js"), "utf8");
    const mapSource = await readFile(join(process.cwd(), "src/render/map.js"), "utf8");
    const mainExternalSpecifiers = await getReachableExternalStaticSpecifiers("src/main.js");

    expect(mainSource).not.toContain('import "maplibre-gl/dist/maplibre-gl.css"');
    expect(mainExternalSpecifiers).not.toContain("maplibre-gl/dist/maplibre-gl.css");
    expect(mapSource).toContain('import("maplibre-gl/dist/maplibre-gl.css")');
    expect(mapSource).toContain('import("maplibre-gl")');
  });

  it("loads route map rendering dynamically from the main app module", async () => {
    const mainSource = await readFile(join(process.cwd(), "src/main.js"), "utf8");
    const staticImportSpecifiers = getStaticImportSpecifiers(mainSource);
    const reachableModules = await getReachableStaticModules("src/main.js");

    expect(staticImportSpecifiers).not.toContain("./render/map.js");
    expect(reachableModules).not.toContain(normalize("src/render/map.js"));
    expect(mainSource).toContain('import("./render/map.js")');
  });

  it("keeps aggregate locale dictionaries out of the initial app graph", async () => {
    const mainSource = await readFile(join(process.cwd(), "src/main.js"), "utf8");
    const i18nSource = await readFile(join(process.cwd(), "src/i18n/index.js"), "utf8");
    const reachableModules = await getReachableStaticModules("src/main.js");

    expect(reachableModules).not.toContain(normalize("src/i18n/locales.js"));
    expect(reachableModules).not.toContain(normalize("src/i18n/locales/ru.js"));
    expect(reachableModules).not.toContain(normalize("src/i18n/locales/es.js"));
    expect(reachableModules).not.toContain(normalize("src/i18n/locales/fr.js"));
    expect(reachableModules).not.toContain(normalize("src/i18n/locales/de.js"));
    expect(mainSource).toContain("loadI18n");
    expect(i18nSource).toContain('import("./locales/ru.js")');
    expect(i18nSource).toContain('import("./locales/es.js")');
    expect(i18nSource).toContain('import("./locales/fr.js")');
    expect(i18nSource).toContain('import("./locales/de.js")');
  });

  it("keeps dormant D3 series chart renderers out of the visible elevation chart chunk", async () => {
    const reachableModules = await getReachableStaticModules("src/render/elevation-chart.js");
    const externalSpecifiers = await getReachableExternalStaticSpecifiers(
      "src/render/elevation-chart.js"
    );

    expect(reachableModules).not.toContain(normalize("src/render/series-charts.js"));
    expect(externalSpecifiers).not.toContain("d3");
  });

  it("keeps PDF export dependencies out of image export paths", async () => {
    const mainSource = await readFile(join(process.cwd(), "src/main.js"), "utf8");
    const exportControllerSource = await readFile(
      join(process.cwd(), "src/controllers/export-controller.js"),
      "utf8"
    );
    const imageReachableModules = await getReachableStaticModules(
      "src/services/image-export-service.js"
    );
    const imageExternalSpecifiers = await getReachableExternalStaticSpecifiers(
      "src/services/image-export-service.js"
    );

    expect(exportControllerSource).toContain('import("../services/image-export-service.js")');
    expect(exportControllerSource).toContain('import("../services/pdf-export-service.js")');
    expect(mainSource).not.toContain('import("./services/export-service.js")');
    expect(imageReachableModules).not.toContain(normalize("src/services/pdf-export-service.js"));
    expect(imageExternalSpecifiers).toContain("html-to-image");
    expect(imageExternalSpecifiers).not.toContain("jspdf");
  });

  it("keeps analysis fallback modules out of the main app module", async () => {
    const reachableModules = await getReachableStaticModules("src/main.js");

    expect(reachableModules).not.toContain(normalize("src/services/track-analysis-pipeline.js"));
    expect(reachableModules).not.toContain(normalize("src/core/gpx-parser.js"));
  });

  it("loads the analysis worker client dynamically from the analysis adapter", async () => {
    const mainSource = await readFile(join(process.cwd(), "src/main.js"), "utf8");
    const adapterSource = await readFile(
      join(process.cwd(), "src/services/track-analysis-adapter.js"),
      "utf8"
    );
    const staticImportSpecifiers = getStaticImportSpecifiers(mainSource);
    const reachableModules = await getReachableStaticModules("src/main.js");

    expect(staticImportSpecifiers).not.toContain("./services/track-analysis-worker-client.js");
    expect(reachableModules).not.toContain(
      normalize("src/services/track-analysis-worker-client.js")
    );
    expect(reachableModules).not.toContain(normalize("src/workers/track-analysis-worker.js"));
    expect(mainSource).toContain('from "./services/track-analysis-adapter.js"');
    expect(adapterSource).toContain('import("./track-analysis-worker-client.js")');
    expect(adapterSource).toContain('import("./track-analysis-pipeline.js")');
  });

  it("keeps default worker-client fallbacks lazy", async () => {
    const clientSource = await readFile(
      join(process.cwd(), "src/services/track-analysis-worker-client.js"),
      "utf8"
    );
    const reachableModules = await getReachableStaticModules(
      "src/services/track-analysis-worker-client.js"
    );

    expect(reachableModules).not.toContain(normalize("src/services/track-analysis-pipeline.js"));
    expect(reachableModules).not.toContain(normalize("src/core/gpx-parser.js"));
    expect(clientSource).toContain('import("./track-analysis-pipeline.js")');
    expect(clientSource).toContain('import("../core/gpx-parser.js")');
  });

  it("keeps default analysis worker creation visible to Vite", async () => {
    const clientSource = await readFile(
      join(process.cwd(), "src/services/track-analysis-worker-client.js"),
      "utf8"
    );

    expect(clientSource).toContain(
      'new Worker(new URL("../workers/track-analysis-worker.js", import.meta.url)'
    );
    expect(clientSource).toContain("createInjectedTrackAnalysisWorker");
    expect(clientSource).toContain("new WorkerConstructor(");
  });

  it("keeps the analysis worker off the fallback pipeline entry module", async () => {
    const workerSource = await readFile(
      join(process.cwd(), "src/workers/track-analysis-worker.js"),
      "utf8"
    );
    const staticImportSpecifiers = getStaticImportSpecifiers(workerSource);
    const reachableModules = await getReachableStaticModules(
      "src/workers/track-analysis-worker.js"
    );

    expect(staticImportSpecifiers).not.toContain("../services/track-analysis-pipeline.js");
    expect(reachableModules).not.toContain(normalize("src/services/track-analysis-pipeline.js"));
  });

  it("keeps UI analysis mode selectors out of heavy analysis modules", async () => {
    const mainSource = await readFile(join(process.cwd(), "src/main.js"), "utf8");
    const mainReachableModules = await getReachableStaticModules("src/main.js");
    const selectorReachableModules = await getReachableStaticModules("src/core/analysis-modes.js");

    expect(mainSource).toContain('from "./core/analysis-modes.js"');
    expect(mainSource).not.toContain('from "./core/metric-modes.js"');
    expect(mainReachableModules).not.toContain(normalize("src/core/metric-modes.js"));
    expect(mainReachableModules).not.toContain(normalize("src/core/track-analyzer.js"));
    expect(mainReachableModules).not.toContain(normalize("src/core/track-cleaner.js"));
    expect(mainReachableModules).not.toContain(normalize("src/core/elevation-profile.js"));
    expect(selectorReachableModules).not.toContain(normalize("src/core/metric-modes.js"));
    expect(selectorReachableModules).not.toContain(normalize("src/core/track-analyzer.js"));
  });

  it("treats static re-exports as reachable module edges", () => {
    const specifiers = getStaticImportSpecifiers(`
      import localDefault from "./local-default.js";
      export { localNamed } from "./local-named.js";
      export * from "./local-all.js";
      export const value = 1;
    `);

    expect(specifiers).toEqual(["./local-default.js", "./local-named.js", "./local-all.js"]);
  });
});

/**
 * @param {string} source
 */
function getStaticImportSpecifiers(source) {
  const sourceFile = ts.createSourceFile(
    "main.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );

  return sourceFile.statements.flatMap((node) => {
    if (ts.isImportDeclaration(node)) {
      return getStringLiteralSourceText(node.moduleSpecifier);
    }

    if (ts.isExportDeclaration(node)) {
      return getStringLiteralSourceText(node.moduleSpecifier);
    }

    return [];
  });
}

/**
 * @param {ts.Expression | undefined} specifier
 * @returns {string[]}
 */
function getStringLiteralSourceText(specifier) {
  return specifier && ts.isStringLiteral(specifier) ? [specifier.text] : [];
}

/**
 * @param {string} entryPath
 */
async function getReachableStaticModules(entryPath) {
  const srcRoot = resolve(process.cwd(), "src");
  const entryFile = resolve(process.cwd(), entryPath);
  /** @type {Set<string>} */
  const visited = new Set();

  await visit(entryFile);

  visited.delete(toProjectRelativePath(entryFile));
  return [...visited].sort();

  /**
   * @param {string} filePath
   */
  async function visit(filePath) {
    const relativePath = toProjectRelativePath(filePath);

    if (visited.has(relativePath)) {
      return;
    }

    visited.add(relativePath);

    const source = await readFile(filePath, "utf8");

    for (const specifier of getStaticImportSpecifiers(source)) {
      const importedFile = resolveLocalSrcImport(filePath, specifier, srcRoot);

      if (importedFile) {
        await visit(importedFile);
      }
    }
  }
}

/**
 * @param {string} entryPath
 */
async function getReachableExternalStaticSpecifiers(entryPath) {
  const srcRoot = resolve(process.cwd(), "src");
  const entryFile = resolve(process.cwd(), entryPath);
  /** @type {Set<string>} */
  const visited = new Set();
  /** @type {Set<string>} */
  const externalSpecifiers = new Set();

  await visit(entryFile);

  return [...externalSpecifiers].sort();

  /**
   * @param {string} filePath
   */
  async function visit(filePath) {
    const relativePath = toProjectRelativePath(filePath);

    if (visited.has(relativePath)) {
      return;
    }

    visited.add(relativePath);

    const source = await readFile(filePath, "utf8");

    for (const specifier of getStaticImportSpecifiers(source)) {
      const importedFile = resolveLocalSrcImport(filePath, specifier, srcRoot);

      if (importedFile) {
        await visit(importedFile);
      } else if (!specifier.startsWith(".")) {
        externalSpecifiers.add(specifier);
      }
    }
  }
}

/**
 * @param {string} importerPath
 * @param {string} specifier
 * @param {string} srcRoot
 */
function resolveLocalSrcImport(importerPath, specifier, srcRoot) {
  if (!specifier.startsWith(".")) {
    return null;
  }

  if (!specifier.endsWith(".js")) {
    return null;
  }

  const resolvedPath = resolve(dirname(importerPath), specifier);
  const candidatePath = resolvedPath;
  const relativeToSrc = relative(srcRoot, candidatePath);

  if (relativeToSrc.startsWith("..") || relativeToSrc === "") {
    return null;
  }

  return candidatePath;
}

/**
 * @param {string} filePath
 */
function toProjectRelativePath(filePath) {
  return normalize(relative(process.cwd(), filePath));
}
