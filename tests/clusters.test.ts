import { describe, expect, it } from "vitest";
import { findClusters } from "../src/model/clusters";
import type { ItemTypeCore, Placement } from "../src/model/types";
import scoreDefault from "./fixtures/score-default.json";

const byId = (types: ItemTypeCore[]) => Object.fromEntries(types.map(t => [t.id, t]));

// 1x1 dot type used for most structural tests.
const dot: ItemTypeCore = { id: "dot", tags: [], synergies: [], cells: [[0, 0]] };
const dotById = { dot };
const p = (id: string, x: number, y: number): Placement => ({ id, type: "dot", x, y, rot: 0 });

describe("findClusters", () => {
  it("groups touching placements and isolates the rest", () => {
    const typesById = byId(scoreDefault.itemTypes as ItemTypeCore[]);
    const groups = findClusters(scoreDefault.placements as Placement[], typesById)
      .map(g => [...g].sort())
      .sort((a, b) => b.length - a.length);
    // Default layout: p1..p7 form one blob, shield p8 sits alone.
    expect(groups).toEqual([["p1", "p2", "p3", "p4", "p5", "p6", "p7"], ["p8"]]);
  });

  it("treats each isolated placement as its own cluster", () => {
    // Three 1x1 dots with gaps between them -- no adjacency.
    const placements = [p("a", 0, 0), p("b", 2, 0), p("c", 4, 0)];
    const groups = findClusters(placements, dotById).map(g => [...g].sort());
    expect(groups.length).toBe(3);
    expect(groups.every(g => g.length === 1)).toBe(true);
  });

  it("does NOT cluster diagonally-touching placements", () => {
    // (0,0) and (1,1) share only a diagonal -- must be two clusters.
    const placements = [p("a", 0, 0), p("b", 1, 1)];
    const groups = findClusters(placements, dotById);
    expect(groups.length).toBe(2);
  });

  it("clusters orthogonally-adjacent placements", () => {
    // (0,0) right of (1,0) -- orthogonally adjacent.
    const placements = [p("a", 0, 0), p("b", 1, 0)];
    const groups = findClusters(placements, dotById);
    expect(groups.length).toBe(1);
  });

  it("chains three placements into one group via transitivity", () => {
    // a-(0,0) touches b-(1,0) touches c-(2,0).
    const placements = [p("a", 0, 0), p("b", 1, 0), p("c", 2, 0)];
    const groups = findClusters(placements, dotById);
    expect(groups.length).toBe(1);
    expect([...groups[0]].sort()).toEqual(["a", "b", "c"]);
  });

  it("handles a multi-cell polyomino adjacent to a 1x1", () => {
    // L-shaped type occupying (0,0),(1,0),(0,1) next to a dot at (2,0).
    const lType: ItemTypeCore = {
      id: "l",
      tags: [],
      synergies: [],
      cells: [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
    };
    const typesById = { l: lType, dot };
    const placements: Placement[] = [
      { id: "l1", type: "l", x: 0, y: 0, rot: 0 },
      { id: "d1", type: "dot", x: 2, y: 0, rot: 0 },
    ];
    // l occupies (0,0),(1,0),(0,1); dot is at (2,0). (1,0) and (2,0) are adjacent.
    const groups = findClusters(placements, typesById);
    expect(groups.length).toBe(1);
  });
});
