import { describe, expect, it } from "vitest";
import { ITEM_TYPES } from "../src/model/catalog";
import type { ImportContext } from "../src/model/importLayout";
import { parseImportedLayout } from "../src/model/importLayout";

// The live board an import is merged into. An import is a patch, so every
// section the file omits falls back to this.
function ctx(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    itemTypes: ITEM_TYPES,
    placements: [],
    gridSize: { w: 10, h: 10 },
    disabledCells: new Set<string>(),
    ...overrides,
  };
}

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
    const result = parseImportedLayout(JSON.stringify(validLayout), ctx());
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
    const result = parseImportedLayout(JSON.stringify(legacy), ctx());
    expect(result.itemTypes?.[0].cells).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(result.itemTypes?.[0]).not.toHaveProperty("size");
  });

  it("rejects malformed JSON and says so", () => {
    expect(() => parseImportedLayout("{nope", ctx())).toThrowError(/not valid JSON/);
  });

  it("rejects a non-object root", () => {
    expect(() => parseImportedLayout("[1,2]", ctx())).toThrowError(/JSON object/);
  });

  it("rejects a bad gridSize and names the field", () => {
    const bad = { ...validLayout, gridSize: { w: "wide", h: 6 } };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(/gridSize/);
  });

  it("rejects a placement missing a field, naming index and field", () => {
    const bad = { placements: [{ id: "p1", type: "core", x: 0, rot: 0 }] };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /placements\[0\].*"y"/,
    );
  });

  it("rejects placements referencing unknown item types, naming both ids", () => {
    const bad = { placements: [{ id: "p9", type: "ghost", x: 0, y: 0, rot: 0 }] };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
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
    const result = parseImportedLayout(JSON.stringify(layout), ctx());
    expect(result.placements?.[0].type).toBe("custom");
  });

  it("rejects an itemTypes entry without an id", () => {
    const bad = { itemTypes: [{ name: "Nameless", tags: [], synergies: [], cells: [[0, 0]] }] };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /itemTypes\[0\].*"id"/,
    );
  });

  it("rejects non-string disabledCells entries", () => {
    const bad = { disabledCells: ["1,1", 7] };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /disabledCells\[1\]/,
    );
  });

  // --- integer / bounds validation ---

  it("rejects fractional x in a placement", () => {
    const bad = { placements: [{ id: "p1", type: "core", x: 1.5, y: 0, rot: 0 }] };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /placements\[0\].*"x"/,
    );
  });

  it("rejects fractional y in a placement", () => {
    const bad = { placements: [{ id: "p1", type: "core", x: 0, y: 0.9, rot: 0 }] };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /placements\[0\].*"y"/,
    );
  });

  it("rejects fractional rot in a placement", () => {
    const bad = { placements: [{ id: "p1", type: "core", x: 0, y: 0, rot: 45.5 }] };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /placements\[0\].*"rot"/,
    );
  });

  it("rejects fractional w in gridSize", () => {
    const bad = { ...validLayout, gridSize: { w: 8.5, h: 6 } };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(/"gridSize".*"w"/);
  });

  it("rejects fractional h in gridSize", () => {
    const bad = { ...validLayout, gridSize: { w: 8, h: 6.1 } };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(/"gridSize".*"h"/);
  });

  it("rejects fractional coordinates in itemType cells", () => {
    const bad = {
      itemTypes: [
        {
          id: "frac",
          name: "Frac",
          glyph: "square",
          color: "#888",
          tags: [],
          synergies: [],
          cells: [[0.5, 0]],
        },
      ],
      placements: [],
    };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(/itemTypes\[0\]/);
  });

  it("rejects non-integer inventory count", () => {
    const bad = { ...validLayout, inventory: { core: 2.5 } };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(/inventory.*"core"/);
  });

  it("rejects placement x out of bounds when gridSize is known", () => {
    const bad = {
      gridSize: { w: 4, h: 4 },
      placements: [{ id: "p1", type: "core", x: 5, y: 0, rot: 0 }],
    };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /placements\[0\].*out of bounds|out of bounds.*placements\[0\]/i,
    );
  });

  it("rejects placement y out of bounds when gridSize is known", () => {
    const bad = {
      gridSize: { w: 4, h: 4 },
      placements: [{ id: "p1", type: "core", x: 0, y: 10, rot: 0 }],
    };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /placements\[0\].*out of bounds|out of bounds.*placements\[0\]/i,
    );
  });

  it("rejects negative placement coordinates", () => {
    const bad = {
      gridSize: { w: 4, h: 4 },
      placements: [{ id: "p1", type: "core", x: -1, y: 0, rot: 0 }],
    };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /placements\[0\].*out of bounds|out of bounds.*placements\[0\]/i,
    );
  });

  // --- extended validation (footprint, overlap, disabled, dedup, format) ---

  it("rejects rot that is not a multiple of 90", () => {
    const bad = { placements: [{ id: "p1", type: "core", x: 0, y: 0, rot: 45 }] };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /placements\[0\].*"rot"/,
    );
  });

  it("rejects a rotated footprint that extends beyond the grid", () => {
    // capacitor (T-shape, 3 cells wide) at x=2 rot=0 in a 4-wide grid:
    // rightmost cell lands at cx=4, which is >= gridW=4.
    const bad = {
      gridSize: { w: 4, h: 4 },
      placements: [{ id: "p1", type: "capacitor", x: 2, y: 0, rot: 0 }],
    };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /placements\[0\].*out of bounds|out of bounds.*placements\[0\]/i,
    );
  });

  it("rejects overlapping placements", () => {
    const bad = {
      gridSize: { w: 4, h: 4 },
      placements: [
        { id: "p1", type: "core", x: 0, y: 0, rot: 0 },
        { id: "p2", type: "core", x: 0, y: 0, rot: 0 },
      ],
    };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /placements\[1\].*overlap|overlap.*placements\[1\]/i,
    );
  });

  it("rejects a placement whose footprint lands on a disabled cell", () => {
    const bad = {
      gridSize: { w: 4, h: 4 },
      disabledCells: ["1,1"],
      placements: [{ id: "p1", type: "core", x: 1, y: 1, rot: 0 }],
    };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /placements\[0\].*disabled|disabled.*placements\[0\]/i,
    );
  });

  it("rejects duplicate placement ids", () => {
    const bad = {
      placements: [
        { id: "dup", type: "core", x: 0, y: 0, rot: 0 },
        { id: "dup", type: "relay", x: 1, y: 0, rot: 0 },
      ],
    };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /duplicate.*placement.*id.*"dup"|placement.*id.*"dup".*duplicate/i,
    );
  });

  it("rejects duplicate item-type ids", () => {
    const bad = {
      itemTypes: [
        {
          id: "dup",
          name: "A",
          glyph: "hex",
          color: "#888",
          tags: [],
          synergies: [],
          cells: [[0, 0]],
        },
        {
          id: "dup",
          name: "B",
          glyph: "hex",
          color: "#999",
          tags: [],
          synergies: [],
          cells: [[0, 0]],
        },
      ],
      placements: [],
    };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /duplicate.*item.type.*id.*"dup"|item.type.*id.*"dup".*duplicate/i,
    );
  });

  it("rejects disabledCells keys that are not integer-pair strings", () => {
    const bad = { disabledCells: ["abc,def"] };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /disabledCells\[0\]/,
    );
  });

  // --- malformed input is rejected, not silently dropped ---

  function typeWith(fields: Record<string, unknown>) {
    return {
      itemTypes: [
        {
          id: "t",
          name: "T",
          glyph: "square",
          color: "#888",
          tags: [],
          synergies: [],
          cells: [[0, 0]],
          ...fields,
        },
      ],
    };
  }

  it("rejects a negative inventory count, naming the key", () => {
    const bad = { inventory: { core: -1 } };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(/inventory.*"core"/);
  });

  it("rejects duplicate cells in an item type, naming the index", () => {
    const bad = typeWith({
      cells: [
        [0, 0],
        [1, 0],
        [0, 0],
      ],
    });
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /itemTypes\[0\].*cells\[2\]|cells\[2\].*itemTypes\[0\]/,
    );
  });

  it("rejects negative cell offsets in an item type", () => {
    const bad = typeWith({
      cells: [
        [0, 0],
        [-1, 0],
      ],
    });
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /itemTypes\[0\].*cells\[1\]|cells\[1\].*itemTypes\[0\]/,
    );
  });

  it("rejects a non-string tag instead of dropping it, naming the index", () => {
    const bad = typeWith({ tags: ["ok", 7] });
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /itemTypes\[0\].*tags\[1\]|tags\[1\].*itemTypes\[0\]/,
    );
  });

  it("rejects a synergy without a string tag instead of dropping it", () => {
    const bad = typeWith({ synergies: [{ tag: "x", positive: true }, { positive: false }] });
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /itemTypes\[0\].*synergies\[1\]|synergies\[1\].*itemTypes\[0\]/,
    );
  });

  it("rejects a non-array tags field instead of coercing it to empty", () => {
    const bad = typeWith({ tags: "power" });
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(
      /itemTypes\[0\].*"tags"/,
    );
  });

  it("still accepts an item type that omits tags and synergies entirely", () => {
    const file = {
      itemTypes: [{ id: "bare", name: "Bare", glyph: "square", color: "#888", cells: [[0, 0]] }],
    };
    const result = parseImportedLayout(JSON.stringify(file), ctx());
    expect(result.itemTypes?.[0].tags).toEqual([]);
    expect(result.itemTypes?.[0].synergies).toEqual([]);
  });

  // --- merged-result validation ---
  //
  // An import is a patch: a section the file omits keeps the current value.
  // Validating each section against the file alone lets a partial import
  // produce a board that no single section is responsible for.

  const CURRENT_CORE = { id: "c1", type: "core", x: 0, y: 0, rot: 0 };

  it("rejects itemTypes that drop a type the current board still uses", () => {
    const file = {
      itemTypes: [
        {
          id: "other",
          name: "Other",
          glyph: "square",
          color: "#888",
          tags: [],
          synergies: [],
          cells: [[0, 0]],
        },
      ],
    };
    expect(() =>
      parseImportedLayout(JSON.stringify(file), ctx({ placements: [CURRENT_CORE] })),
    ).toThrowError(/c1.*core|core.*c1/);
  });

  it("validates file placements against the current grid when gridSize is absent", () => {
    const file = { placements: [{ id: "p1", type: "core", x: 9, y: 9, rot: 0 }] };
    expect(() =>
      parseImportedLayout(JSON.stringify(file), ctx({ gridSize: { w: 4, h: 4 } })),
    ).toThrowError(/placements\[0\].*out of bounds|out of bounds.*placements\[0\]/i);
  });

  it("rejects overlapping file placements when gridSize is absent", () => {
    const file = {
      placements: [
        { id: "p1", type: "core", x: 0, y: 0, rot: 0 },
        { id: "p2", type: "core", x: 0, y: 0, rot: 0 },
      ],
    };
    expect(() => parseImportedLayout(JSON.stringify(file), ctx())).toThrowError(
      /placements\[1\].*overlap|overlap.*placements\[1\]/i,
    );
  });

  it("rejects a gridSize that shrinks below the current board's footprint", () => {
    const file = { gridSize: { w: 2, h: 2 } };
    expect(() =>
      parseImportedLayout(
        JSON.stringify(file),
        ctx({ placements: [{ id: "c1", type: "core", x: 5, y: 5, rot: 0 }] }),
      ),
    ).toThrowError(/c1.*out of bounds|out of bounds.*c1/i);
  });

  it("rejects disabledCells that land under a current placement", () => {
    const file = { disabledCells: ["0,0"] };
    expect(() =>
      parseImportedLayout(JSON.stringify(file), ctx({ placements: [CURRENT_CORE] })),
    ).toThrowError(/c1.*disabled|disabled.*c1/i);
  });

  it("accepts a partial import that stays legal against the current board", () => {
    const file = { inventory: { core: 3 } };
    const result = parseImportedLayout(
      JSON.stringify(file),
      ctx({ placements: [CURRENT_CORE], disabledCells: new Set(["9,9"]) }),
    );
    expect(result.inventory).toEqual({ core: 3 });
    expect(result.placements).toBeUndefined();
  });

  // --- gridSize bounds (must match the UI's resize range) ---

  it("rejects a gridSize of zero", () => {
    const bad = { gridSize: { w: 0, h: 6 } };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(/"gridSize".*"w"/);
  });

  it("rejects a negative gridSize", () => {
    const bad = { gridSize: { w: 8, h: -6 } };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(/"gridSize".*"h"/);
  });

  it("rejects a gridSize beyond the UI maximum", () => {
    const bad = { gridSize: { w: 5000, h: 6 } };
    expect(() => parseImportedLayout(JSON.stringify(bad), ctx())).toThrowError(/"gridSize".*"w"/);
  });

  it("accepts a gridSize at both ends of the allowed range", () => {
    expect(
      parseImportedLayout(JSON.stringify({ gridSize: { w: 2, h: 2 } }), ctx()).gridSize,
    ).toEqual({ w: 2, h: 2 });
    expect(
      parseImportedLayout(JSON.stringify({ gridSize: { w: 20, h: 20 } }), ctx()).gridSize,
    ).toEqual({ w: 20, h: 20 });
  });
});
