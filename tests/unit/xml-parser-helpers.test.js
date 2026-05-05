import { describe, expect, it } from "vitest";

import {
  findAncestor,
  getChildText,
  getDescendantText,
  getDescendantsByLocalName,
  getDirectChildrenByLocalName,
  serializeElements
} from "../../src/core/xml-parser-helpers.js";

function parseXml(source) {
  return new DOMParser().parseFromString(source, "application/xml");
}

describe("xml parser helpers", () => {
  it("reads direct child text and descendant text by local name", () => {
    const doc = parseXml(
      `<root><parent><name> Direct </name><child><name> Nested </name></child></parent></root>`
    );
    const parent = doc.getElementsByTagName("parent")[0];

    expect(getChildText(parent, "name")).toBe("Direct");
    expect(getDescendantText(parent, "name")).toBe("Direct");
    expect(getDescendantText(parent, "missing")).toBeNull();
  });

  it("finds direct children, descendants, and ancestors by local name", () => {
    const doc = parseXml(`<root><lap><track><point><time>2024</time></point></track></lap></root>`);
    const lap = doc.getElementsByTagName("lap")[0];
    const point = doc.getElementsByTagName("point")[0];

    expect(getDirectChildrenByLocalName(lap, "track")).toHaveLength(1);
    expect(getDescendantsByLocalName(doc, "time")).toHaveLength(1);
    expect(findAncestor(point, "lap")).toBe(lap);
    expect(findAncestor(point, "missing")).toBeNull();
  });

  it("serializes XML elements", () => {
    const doc = parseXml(`<root><extension><value>42</value></extension></root>`);
    const extension = doc.getElementsByTagName("extension")[0];

    expect(serializeElements([extension])).toEqual(["<extension><value>42</value></extension>"]);
  });
});
