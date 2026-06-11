import { describe, expect, it } from "vitest";
import {
  allPlacementsFit,
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

describe("allPlacementsFit / resizeFit", () => {
  const single: ItemTypeCore = { id: "s", tags: [], synergies: [], cells: [[0, 0]] };
  const typesById = { s: single };
  const p = (id: string, x: number, y: number): Placement => ({ id, type: "s", x, y, rot: 0 });

  it("allPlacementsFit detects overflow", () => {
    expect(allPlacementsFit([p("a", 3, 3)], 4, 4, typesById)).toBe(true);
    expect(allPlacementsFit([p("a", 4, 3)], 4, 4, typesById)).toBe(false);
  });

  it("resizeFit leaves placements alone when they already fit", () => {
    const res = resizeFit([p("a", 1, 1)], new Set<string>(), 4, 4, typesById);
    expect(res).not.toBeNull();
    expect(res!.placements).toEqual([p("a", 1, 1)]);
  });

  it("resizeFit shifts toward origin only as much as needed", () => {
    // Items span x 2..5; shrinking to width 4 needs a shift of 2.
    const res = resizeFit([p("a", 2, 0), p("b", 5, 0)], new Set<string>(), 4, 3, typesById);
    expect(res).not.toBeNull();
    expect(res!.placements.map(q => q.x)).toEqual([0, 3]);
  });

  it("resizeFit shifts disabled cells and drops out-of-range ones", () => {
    const res = resizeFit([p("a", 5, 5)], new Set(["5,0", "0,0"]), 3, 3, typesById);
    expect(res).not.toBeNull();
    // Shift is (3,3): both disabled cells land outside the new grid and drop.
    expect(res!.placements[0]).toMatchObject({ x: 2, y: 2 });
    expect(Array.from(res!.disabled)).toEqual([]);
  });

  it("resizeFit returns null when the occupied span cannot fit", () => {
    expect(resizeFit([p("a", 0, 0), p("b", 4, 0)], new Set<string>(), 4, 4, typesById)).toBeNull();
  });
});
