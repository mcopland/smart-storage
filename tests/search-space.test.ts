import { describe, expect, it } from "vitest";
import { boardSignature } from "../src/model/searchSpace";
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
