import { describe, expect, it } from "vitest";
import { findClusters } from "../src/model/clusters";
import type { ItemTypeCore, Placement } from "../src/model/types";
import scoreDefault from "./fixtures/score-default.json";

const byId = (types: ItemTypeCore[]) => Object.fromEntries(types.map(t => [t.id, t]));

describe("findClusters", () => {
  it("groups touching placements and isolates the rest", () => {
    const typesById = byId(scoreDefault.itemTypes as ItemTypeCore[]);
    const groups = findClusters(scoreDefault.placements as Placement[], typesById)
      .map(g => [...g].sort())
      .sort((a, b) => b.length - a.length);
    // Default layout: p1..p7 form one blob, shield p8 sits alone.
    expect(groups).toEqual([["p1", "p2", "p3", "p4", "p5", "p6", "p7"], ["p8"]]);
  });
});
