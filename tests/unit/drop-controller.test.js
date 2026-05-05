import { describe, expect, it, vi } from "vitest";

import { preventInactiveFileDrop } from "../../src/controllers/drop-controller.js";

describe("drop controller", () => {
  it("prevents default browser handling for inactive file drops", () => {
    const event = {
      dataTransfer: { types: ["Files"] },
      preventDefault: vi.fn()
    };

    preventInactiveFileDrop(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("leaves non-file drops alone", () => {
    const event = {
      dataTransfer: { types: ["text/plain"] },
      preventDefault: vi.fn()
    };

    preventInactiveFileDrop(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
