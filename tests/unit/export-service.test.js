import { afterEach, describe, expect, it } from "vitest";
import { supportsClipboardImage as supportsClipboardImageFromCapabilities } from "../../src/services/export-capabilities.js";
import { supportsClipboardImage } from "../../src/services/image-export-service.js";
import { getPdfSettings } from "../../src/services/pdf-export-service.js";

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalClipboardItemDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "ClipboardItem"
);

afterEach(() => {
  if (originalClipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }

  if (originalClipboardItemDescriptor) {
    Object.defineProperty(globalThis, "ClipboardItem", originalClipboardItemDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "ClipboardItem");
  }
});

describe("export service helpers", () => {
  it("returns portrait PDF settings for route report", () => {
    expect(getPdfSettings("route-report")).toMatchObject({
      orientation: "portrait",
      format: "a4"
    });
  });

  it("does not support clipboard images when clipboard write is unavailable", () => {
    setClipboardEnvironment({
      clipboard: {},
      ClipboardItem: function ClipboardItem() {
        return undefined;
      }
    });

    expect(supportsClipboardImage()).toBe(false);
  });

  it("does not support clipboard images when ClipboardItem is unavailable", () => {
    setClipboardEnvironment({
      clipboard: {
        write() {
          return undefined;
        }
      }
    });

    expect(supportsClipboardImage()).toBe(false);
  });

  it("supports clipboard images when clipboard write and ClipboardItem are functions", () => {
    setClipboardEnvironment({
      clipboard: {
        write() {
          return undefined;
        }
      },
      ClipboardItem: function ClipboardItem() {
        return undefined;
      }
    });

    expect(supportsClipboardImage()).toBe(true);
  });

  it("does not support clipboard images when ClipboardItem rejects image/png", () => {
    const ClipboardItem = function ClipboardItem() {
      return undefined;
    };
    ClipboardItem.supports = (type) => type !== "image/png";

    setClipboardEnvironment({
      clipboard: {
        write() {
          return undefined;
        }
      },
      ClipboardItem
    });

    expect(supportsClipboardImage()).toBe(false);
  });

  it("supports clipboard images when ClipboardItem accepts image/png", () => {
    const ClipboardItem = function ClipboardItem() {
      return undefined;
    };
    ClipboardItem.supports = (type) => type === "image/png";

    setClipboardEnvironment({
      clipboard: {
        write() {
          return undefined;
        }
      },
      ClipboardItem
    });

    expect(supportsClipboardImage()).toBe(true);
  });

  it("exports lightweight clipboard image capability detection from the capabilities module", () => {
    const environment = {
      ClipboardItem: function ClipboardItem() {
        return undefined;
      },
      navigator: {
        clipboard: {
          write() {
            return undefined;
          }
        }
      }
    };

    expect(supportsClipboardImageFromCapabilities(environment)).toBe(true);
    expect(supportsClipboardImage(environment)).toBe(
      supportsClipboardImageFromCapabilities(environment)
    );
  });
});

/**
 * @param {{ clipboard: unknown; ClipboardItem?: unknown }} environment
 */
function setClipboardEnvironment({ clipboard, ClipboardItem }) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard
  });

  if (ClipboardItem) {
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: ClipboardItem
    });
  } else {
    Reflect.deleteProperty(globalThis, "ClipboardItem");
  }
}
