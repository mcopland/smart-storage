import { describe, expect, it } from "vitest";
import { ITEM_TYPES } from "../src/model/catalog";
import { parseImportedLayout } from "../src/model/importLayout";

const validLayout = {
  gridSize: { w: 8, h: 6 },
  placements: [
    { id: "p1", type: "core", x: 0, y: 0, rot: 0 },
    { id: "p2", type: "relay", x: 1, y: 0, rot: 90 },
  ],
  disabledCells: ["3,3"],
  inventory: { core: 2 },
};

describe("parseImportedLayout", () => {
  it("parses a valid layout export", () => {
    const result = parseImportedLayout(JSON.stringify(validLayout), ITEM_TYPES);
    expect(result.gridSize).toEqual({ w: 8, h: 6 });
    expect(result.placements).toHaveLength(2);
    expect(result.disabledCells).toEqual(["3,3"]);
    expect(result.inventory).toEqual({ core: 2 });
    expect(result.itemTypes).toBeUndefined();
  });

  it("normalizes legacy rectangular size to cells", () => {
    const legacy = {
      itemTypes: [
        {
          id: "slab",
          name: "Slab",
          glyph: "square",
          color: "#888",
          tags: [],
          synergies: [],
          size: [2, 1],
        },
      ],
      placements: [{ id: "p1", type: "slab", x: 0, y: 0, rot: 0 }],
    };
    const result = parseImportedLayout(JSON.stringify(legacy), ITEM_TYPES);
    expect(result.itemTypes?.[0].cells).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(result.itemTypes?.[0]).not.toHaveProperty("size");
  });

  it("rejects malformed JSON and says so", () => {
    expect(() => parseImportedLayout("{nope", ITEM_TYPES)).toThrowError(/not valid JSON/);
  });

  it("rejects a non-object root", () => {
    expect(() => parseImportedLayout("[1,2]", ITEM_TYPES)).toThrowError(/JSON object/);
  });

  it("rejects a bad gridSize and names the field", () => {
    const bad = { ...validLayout, gridSize: { w: "wide", h: 6 } };
    expect(() => parseImportedLayout(JSON.stringify(bad), ITEM_TYPES)).toThrowError(/gridSize/);
  });

  it("rejects a placement missing a field, naming index and field", () => {
    const bad = { placements: [{ id: "p1", type: "core", x: 0, rot: 0 }] };
    expect(() => parseImportedLayout(JSON.stringify(bad), ITEM_TYPES)).toThrowError(
      /placements\[0\].*"y"/,
    );
  });

  it("rejects placements referencing unknown item types, naming both ids", () => {
    const bad = { placements: [{ id: "p9", type: "ghost", x: 0, y: 0, rot: 0 }] };
    expect(() => parseImportedLayout(JSON.stringify(bad), ITEM_TYPES)).toThrowError(
      /p9.*ghost|ghost.*p9/,
    );
  });

  it("checks placement types against imported itemTypes when present", () => {
    const layout = {
      itemTypes: [
        {
          id: "custom",
          name: "Custom",
          glyph: "square",
          color: "#888",
          tags: [],
          synergies: [],
          cells: [[0, 0]],
        },
      ],
      placements: [{ id: "p1", type: "custom", x: 0, y: 0, rot: 0 }],
    };
    const result = parseImportedLayout(JSON.stringify(layout), ITEM_TYPES);
    expect(result.placements?.[0].type).toBe("custom");
  });

  it("rejects an itemTypes entry without an id", () => {
    const bad = { itemTypes: [{ name: "Nameless", tags: [], synergies: [], cells: [[0, 0]] }] };
    expect(() => parseImportedLayout(JSON.stringify(bad), ITEM_TYPES)).toThrowError(
      /itemTypes\[0\].*"id"/,
    );
  });

  it("rejects non-string disabledCells entries", () => {
    const bad = { disabledCells: ["1,1", 7] };
    expect(() => parseImportedLayout(JSON.stringify(bad), ITEM_TYPES)).toThrowError(
      /disabledCells\[1\]/,
    );
  });
});
