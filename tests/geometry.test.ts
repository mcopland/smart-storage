import { describe, expect, it } from "vitest";
import {
  cellsFitIn,
  findFirstFit,
  fits,
  getDims,
  getTypeSize,
  resizeFit,
  rotateCells,
} from "../src/model/geometry";
import type { ItemTypeCore, Placement } from "../src/model/types";
import fitsFixture from "./fixtures/fits.json";
import rotations from "./fixtures/rotations.json";

const byId = (types: ItemTypeCore[]) => Object.fromEntries(types.map(t => [t.id, t]));

describe("rotateCells", () => {
  for (const c of rotations.cases) {
    it(`rotates ${c.name} by ${c.rot}`, () => {
      expect(rotateCells(c.cells as [number, number][], c.rot)).toEqual(c.expected);
    });
  }
});

describe("fits", () => {
  const typesById = byId(fitsFixture.itemTypes as ItemTypeCore[]);
  const placements = fitsFixture.placements as Placement[];
  const disabled = new Set(fitsFixture.disabledCells);
  for (const [i, c] of fitsFixture.cases.entries()) {
    it(`case ${i}: ${c.placement.type}@(${c.placement.x},${c.placement.y}) rot ${c.placement.rot} -> ${c.expected}`, () => {
      expect(
        fits(
          c.placement as Placement,
          placements,
          fitsFixture.gridW,
          fitsFixture.gridH,
          c.ignoreId,
          disabled,
          typesById,
        ),
      ).toBe(c.expected);
    });
  }
});

describe("shape dimensions", () => {
  const tShape: ItemTypeCore = {
    id: "t",
    tags: [],
    synergies: [],
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [1, 1],
    ],
  };
  const typesById = { t: tShape };

  it("getTypeSize returns base bounding box", () => {
    expect(getTypeSize(tShape)).toEqual([3, 2]);
  });

  it("getDims swaps bounding box under 90 deg rotation", () => {
    expect(getDims({ id: "p", type: "t", x: 0, y: 0, rot: 0 }, typesById)).toEqual([3, 2]);
    expect(getDims({ id: "p", type: "t", x: 0, y: 0, rot: 90 }, typesById)).toEqual([2, 3]);
  });
});

describe("resizeFit", () => {
  const single: ItemTypeCore = { id: "s", tags: [], synergies: [], cells: [[0, 0]] };
  const typesById = { s: single };
  const p = (id: string, x: number, y: number): Placement => ({ id, type: "s", x, y, rot: 0 });

  it("leaves placements alone when they already fit", () => {
    const res = resizeFit([p("a", 1, 1)], new Set<string>(), 4, 4, typesById);
    expect(res).not.toBeNull();
    expect(res!.placements).toEqual([p("a", 1, 1)]);
  });

  it("shifts toward origin only as much as needed", () => {
    // Items span x 2..5; shrinking to width 4 needs a shift of 2.
    const res = resizeFit([p("a", 2, 0), p("b", 5, 0)], new Set<string>(), 4, 3, typesById);
    expect(res).not.toBeNull();
    expect(res!.placements.map(q => q.x)).toEqual([0, 3]);
  });

  it("shifts disabled cells and drops out-of-range ones", () => {
    const res = resizeFit([p("a", 5, 5)], new Set(["5,0", "0,0"]), 3, 3, typesById);
    expect(res).not.toBeNull();
    // Shift is (3,3): both disabled cells land outside the new grid and drop.
    expect(res!.placements[0]).toMatchObject({ x: 2, y: 2 });
    expect(Array.from(res!.disabled)).toEqual([]);
  });

  it("returns null when the occupied span cannot fit", () => {
    expect(resizeFit([p("a", 0, 0), p("b", 4, 0)], new Set<string>(), 4, 4, typesById)).toBeNull();
  });
});

describe("cellsFitIn", () => {
  it("passes when cells are in-bounds and unoccupied", () => {
    expect(
      cellsFitIn(
        [
          [0, 0],
          [1, 0],
        ],
        new Set(),
        4,
        4,
        null,
      ),
    ).toBe(true);
  });

  it("fails when a cell is out of bounds", () => {
    expect(cellsFitIn([[4, 0]], new Set(), 4, 4, null)).toBe(false);
    expect(cellsFitIn([[0, 4]], new Set(), 4, 4, null)).toBe(false);
    expect(cellsFitIn([[-1, 0]], new Set(), 4, 4, null)).toBe(false);
  });

  it("fails when a cell is in the occupied set", () => {
    const occupied = new Set(["2,1"]);
    expect(cellsFitIn([[2, 1]], occupied, 4, 4, null)).toBe(false);
    expect(cellsFitIn([[2, 0]], occupied, 4, 4, null)).toBe(true);
  });

  it("fails when a cell is disabled", () => {
    const disabled = new Set(["1,1"]);
    expect(cellsFitIn([[1, 1]], new Set(), 4, 4, disabled)).toBe(false);
    expect(cellsFitIn([[0, 0]], new Set(), 4, 4, disabled)).toBe(true);
  });
});

describe("findFirstFit", () => {
  // 1x1 single-cell type used in most cases.
  const dot: ItemTypeCore = { id: "dot", tags: [], synergies: [], cells: [[0, 0]] };
  // 1x2 horizontal bar -- does NOT fit when only one column wide but fits rotated.
  const hbar: ItemTypeCore = {
    id: "hbar",
    tags: [],
    synergies: [],
    cells: [
      [0, 0],
      [1, 0],
    ],
  };
  const typesById = { dot, hbar };

  it("returns top-left (0,0) rot-0 placement when the grid is empty", () => {
    const result = findFirstFit("dot", "x1", [], 4, 4, new Set(), typesById);
    expect(result).toMatchObject({ type: "dot", x: 0, y: 0, rot: 0 });
  });

  it("returns the assigned id, not a generated one", () => {
    const result = findFirstFit("dot", "my-id", [], 4, 4, new Set(), typesById);
    expect(result?.id).toBe("my-id");
  });

  it("skips occupied cells and returns the first free spot", () => {
    const placed: Placement[] = [
      { id: "a", type: "dot", x: 0, y: 0, rot: 0 },
      { id: "b", type: "dot", x: 1, y: 0, rot: 0 },
    ];
    const result = findFirstFit("dot", "x2", placed, 4, 4, new Set(), typesById);
    expect(result).toMatchObject({ x: 2, y: 0, rot: 0 });
  });

  it("skips disabled cells", () => {
    // Top row fully disabled; first free spot should be (0,1).
    const disabled = new Set(["0,0", "1,0", "2,0", "3,0"]);
    const result = findFirstFit("dot", "x3", [], 4, 4, disabled, typesById);
    expect(result).toMatchObject({ x: 0, y: 1 });
  });

  it("tries rotations and returns a rotated placement when the base orientation does not fit", () => {
    // Grid is 1 column wide -- a 1x2 hbar only fits as rot 90 (becomes 2 rows tall).
    const result = findFirstFit("hbar", "x4", [], 1, 4, new Set(), typesById);
    expect(result).not.toBeNull();
    expect(result?.rot).not.toBe(0); // must be rotated
  });

  it("returns null when every cell is occupied", () => {
    const placed: Placement[] = [
      { id: "a", type: "dot", x: 0, y: 0, rot: 0 },
      { id: "b", type: "dot", x: 1, y: 0, rot: 0 },
      { id: "c", type: "dot", x: 0, y: 1, rot: 0 },
      { id: "d", type: "dot", x: 1, y: 1, rot: 0 },
    ];
    expect(findFirstFit("dot", "x5", placed, 2, 2, new Set(), typesById)).toBeNull();
  });

  it("returns null when every cell is disabled", () => {
    const disabled = new Set(["0,0", "1,0", "0,1", "1,1"]);
    expect(findFirstFit("dot", "x6", [], 2, 2, disabled, typesById)).toBeNull();
  });
});
