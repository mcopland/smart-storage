import { describe, expect, it } from "vitest";
import { boardSignature, formatBound, upperBoundLayouts } from "../src/model/searchSpace";
import type { ItemType, Placement } from "../src/model/types";

const TYPE_A: ItemType = {
  id: "a",
  name: "A",
  glyph: "square",
  color: "#f00",
  desc: "",
  tags: ["X"],
  synergies: [],
  cells: [[0, 0]],
};

const TYPE_B: ItemType = {
  id: "b",
  name: "B",
  glyph: "circle",
  color: "#0f0",
  desc: "",
  tags: ["Y"],
  synergies: [{ tag: "X", positive: true }],
  // L-shape: distinct under rotation
  cells: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
};

const PLACEMENTS: Placement[] = [
  { id: "p1", type: "a", x: 0, y: 0, rot: 0 },
  { id: "p2", type: "b", x: 2, y: 0, rot: 0 },
];

describe("upperBoundLayouts", () => {
  it("returns 1 for an empty placement list", () => {
    expect(upperBoundLayouts([TYPE_A], [], 5, 5)).toBe(1n);
  });

  it("includes grid positions and rotation count per item", () => {
    // TYPE_A is 1x1 (single cell) -- all 4 rotations are identical, so 1 distinct rotation.
    // On a 3x3 grid: 9 positions * 1 rotation = 9.
    const bound = upperBoundLayouts([TYPE_A], [{ id: "p", type: "a", x: 0, y: 0, rot: 0 }], 3, 3);
    expect(bound).toBe(9n); // 9 positions * 1 rotation
  });

  it("multiplies per-item bounds together", () => {
    // Two TYPE_A items on a 2x2 grid: (4 * 1) * (4 * 1) = 16.
    const p: Placement[] = [
      { id: "p1", type: "a", x: 0, y: 0, rot: 0 },
      { id: "p2", type: "a", x: 1, y: 0, rot: 0 },
    ];
    expect(upperBoundLayouts([TYPE_A], p, 2, 2)).toBe(16n);
  });

  it("accounts for L-shape having 4 distinct rotations", () => {
    // TYPE_B is an L-shape: all 4 rotations are distinct.
    // On 4x4 grid: 16 positions * 4 rotations = 64.
    const p: Placement[] = [{ id: "p", type: "b", x: 0, y: 0, rot: 0 }];
    expect(upperBoundLayouts([TYPE_B], p, 4, 4)).toBe(64n);
  });
});

describe("formatBound", () => {
  it("returns the raw number for small values", () => {
    expect(formatBound(0n)).toBe("0");
    expect(formatBound(999n)).toBe("999");
  });

  it("abbreviates millions", () => {
    expect(formatBound(1_200_000n)).toMatch(/~1\.\d+M/);
  });

  it("abbreviates billions", () => {
    expect(formatBound(3_400_000_000n)).toMatch(/~3\.\d+B/);
  });

  it("uses scientific notation for huge values", () => {
    expect(formatBound(BigInt("1" + "0".repeat(18))).toString()).toMatch(/e/i);
  });
});

describe("boardSignature", () => {
  const base = boardSignature([TYPE_A, TYPE_B], PLACEMENTS, 10, 10, new Set());

  it("is stable when only positions/rotations change", () => {
    const moved: Placement[] = [
      { id: "p1", type: "a", x: 3, y: 3, rot: 0 },
      { id: "p2", type: "b", x: 5, y: 5, rot: 90 },
    ];
    expect(boardSignature([TYPE_A, TYPE_B], moved, 10, 10, new Set())).toBe(base);
  });

  it("differs when the type multiset changes (add item)", () => {
    const more: Placement[] = [...PLACEMENTS, { id: "p3", type: "a", x: 0, y: 5, rot: 0 }];
    expect(boardSignature([TYPE_A, TYPE_B], more, 10, 10, new Set())).not.toBe(base);
  });

  it("differs when the type multiset changes (remove item)", () => {
    expect(boardSignature([TYPE_A, TYPE_B], [PLACEMENTS[0]], 10, 10, new Set())).not.toBe(base);
  });

  it("differs when grid size changes", () => {
    expect(boardSignature([TYPE_A, TYPE_B], PLACEMENTS, 8, 10, new Set())).not.toBe(base);
  });

  it("differs when disabled cells change", () => {
    expect(boardSignature([TYPE_A, TYPE_B], PLACEMENTS, 10, 10, new Set(["3,3"]))).not.toBe(base);
  });

  it("differs when a placed type's tags change", () => {
    const modified: ItemType = { ...TYPE_A, tags: ["Z"] };
    expect(boardSignature([modified, TYPE_B], PLACEMENTS, 10, 10, new Set())).not.toBe(base);
  });

  it("differs when a placed type's synergies change", () => {
    const modified: ItemType = {
      ...TYPE_A,
      synergies: [{ tag: "X", positive: true }],
    };
    expect(boardSignature([modified, TYPE_B], PLACEMENTS, 10, 10, new Set())).not.toBe(base);
  });

  it("differs when a placed type's cells change", () => {
    const modified: ItemType = {
      ...TYPE_A,
      cells: [
        [0, 0],
        [1, 0],
      ],
    };
    expect(boardSignature([modified, TYPE_B], PLACEMENTS, 10, 10, new Set())).not.toBe(base);
  });

  it("ignores display-only fields like name, glyph, color", () => {
    const modified: ItemType = { ...TYPE_A, name: "Alpha", glyph: "diamond", color: "#999" };
    expect(boardSignature([modified, TYPE_B], PLACEMENTS, 10, 10, new Set())).toBe(base);
  });
});
