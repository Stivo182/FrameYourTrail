import { describe, expect, it } from "vitest";
import {
  renderAppShell,
  renderExportControls,
  renderEmptyState,
  renderLanguageSelect,
  renderMapStyleSelect,
  renderMessages
} from "../../src/render/app-shell.js";

const i18n = (language = "en", translations = {}) => ({
  language,
  t: (key) => translations[key] ?? key
});

describe("app shell renderer", () => {
  it("renders the toolbar shell with escaped labels and injected controls", () => {
    const html = renderAppShell({
      i18n: i18n("en", {
        "site.toolbarLabel": "Toolbar <main>",
        "site.tagline": "Make <route> posters",
        "site.uploadFile": "Upload & inspect"
      }),
      hasPoster: true,
      analysisModeSelectHtml: "<div data-analysis-mode-menu></div>",
      mapStyleSelectHtml: "<details data-map-style-menu></details>",
      exportControlsHtml: "<div data-export-controls></div>",
      languageSelectHtml: "<details data-language-menu></details>",
      messagesHtml: "<section data-messages></section>",
      contentHtml: "<section data-workspace></section>"
    });

    expect(html).toContain('class="app-shell app-shell--has-poster"');
    expect(html).toContain('aria-label="Toolbar &lt;main&gt;"');
    expect(html).toContain("<h1>Frame Your Trail</h1>");
    expect(html).toContain("Make &lt;route&gt; posters");
    expect(html).toContain("Upload &amp; inspect");
    expect(html).toContain("<div data-analysis-mode-menu></div>");
    expect(html).toContain("<details data-map-style-menu></details>");
    expect(html).toContain("<div data-export-controls></div>");
    expect(html).toContain("<details data-language-menu></details>");
    expect(html).toContain("<section data-messages></section>");
    expect(html).toContain("<section data-workspace></section>");
  });

  it("limits drag-and-drop uploads to the empty state", () => {
    const emptyHtml = renderEmptyState(
      i18n("en", {
        "site.emptyTitle": "Drop a route",
        "site.emptyBody": "Choose or drop a local file."
      })
    );
    const loadedHtml = renderAppShell({
      i18n: i18n("en", {
        "site.toolbarLabel": "Toolbar",
        "site.tagline": "Make route posters",
        "site.uploadFile": "Upload"
      }),
      hasPoster: true,
      analysisModeSelectHtml: "",
      mapStyleSelectHtml: "",
      exportControlsHtml: "",
      languageSelectHtml: "",
      messagesHtml: "",
      contentHtml: "<section data-workspace></section>"
    });

    expect(emptyHtml).toContain("data-drop-zone");
    expect(loadedHtml).not.toContain("data-drop-zone");
  });

  it("renders errors before warnings and escapes message text", () => {
    const html = renderMessages(
      {
        errors: [{ code: "parse_error", messageKey: "messages.parseError" }],
        warnings: [{ code: "custom_warning", message: "Warning <raw>" }]
      },
      i18n("en", { "messages.parseError": "Parse <failed>" })
    );

    expect(html.indexOf("message--error")).toBeLessThan(html.indexOf("message--warning"));
    expect(html).toContain("Parse &lt;failed&gt;");
    expect(html).toContain("Warning &lt;raw&gt;");
    expect(renderMessages({ errors: [], warnings: [] }, i18n())).toBe("");
  });

  it("renders warning-only messages as a status live region", () => {
    const html = renderMessages(
      {
        errors: [],
        warnings: [{ code: "custom_warning", message: "Check this route" }]
      },
      i18n()
    );

    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
  });

  it("renders error-only messages as an alert live region", () => {
    const html = renderMessages(
      {
        errors: [{ code: "parse_error", message: "Cannot parse file" }],
        warnings: []
      },
      i18n()
    );

    expect(html).toContain('role="alert"');
    expect(html).not.toContain('role="status"');
  });

  it("renders mixed error and warning messages as an alert live region", () => {
    const html = renderMessages(
      {
        errors: [{ code: "parse_error", message: "Cannot parse file" }],
        warnings: [{ code: "custom_warning", message: "Check this route" }]
      },
      i18n()
    );

    expect(html).toContain('role="alert"');
    expect(html).not.toContain('role="status"');
  });

  it("renders the active language summary and radio options", () => {
    const html = renderLanguageSelect(
      i18n("de", {
        "site.languageLabel": "Language <Select>"
      })
    );

    expect(html).toContain('aria-label="Language &lt;Select&gt;: DE Deutsch"');
    expect(html).toContain('<span class="language-menu__prefix">DE</span>');
    expect(html).toContain('value="de"');
    expect(html).toContain("checked");
    expect(html).toContain("English");
  });

  it("renders the active map style summary and radio options", () => {
    const html = renderMapStyleSelect(
      i18n("en", {
        "mapStyle.selectLabel": "Map style",
        "mapStyle.styles.openfreemap_poster.label": "OpenFreeMap",
        "mapStyle.styles.openfreemap_poster.description": "Muted",
        "mapStyle.styles.osm_standard.label": "OSM",
        "mapStyle.styles.osm_standard.description": "Standard",
        "mapStyle.styles.cyclosm.label": "CyclOSM",
        "mapStyle.styles.cyclosm.description": "Bike"
      }),
      "cyclosm"
    );

    expect(html).toContain("data-map-style-menu");
    expect(html).toContain("data-map-style-option");
    expect(html).toContain('value="cyclosm"');
    expect(html).toContain("checked");
    expect(html).toContain("CyclOSM");
    expect(html).toContain("Bike");
  });

  it("renders export controls as an escaped compact menu", () => {
    const html = renderExportControls(
      i18n("en", {
        "site.exportAria": "Export <poster>",
        "site.exportLabel": "Save & share:",
        "site.clipboard": "Copy <image>"
      })
    );

    expect(html).toContain("data-export-menu");
    expect(html).toContain('aria-label="Export &lt;poster&gt;"');
    expect(html).toContain('title="Export &lt;poster&gt;"');
    expect(html).toContain("Save &amp; share");
    expect(html).not.toContain("Save &amp; share:");
    expect(html).toContain('class="export-menu__panel"');
    expect(html).toContain('data-export="png"');
    expect(html).toContain('data-export="jpeg"');
    expect(html).toContain('data-export="pdf"');
    expect(html).toContain('data-export="clipboard"');
    expect(html).toContain("Copy &lt;image&gt;");
  });

  it("renders clipboard export only when clipboard images are supported", () => {
    const translations = {
      "site.exportAria": "Export poster",
      "site.exportLabel": "Export",
      "site.clipboard": "Clipboard"
    };

    expect(renderExportControls(i18n("en", translations), { clipboardSupported: true })).toContain(
      'data-export="clipboard"'
    );
    expect(
      renderExportControls(i18n("en", translations), { clipboardSupported: false })
    ).not.toContain('data-export="clipboard"');
  });
});
