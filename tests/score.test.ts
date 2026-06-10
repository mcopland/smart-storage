import { describe, expect, it } from "vitest";
import { calcScore, findClusters, tagSynergy } from "../src/model/score";
import type { ItemTypeCore, Placement, ScoreResult } from "../src/model/types";
import scoreCustom from "./fixtures/score-custom-types.json";
import scoreDefault from "./fixtures/score-default.json";
import scoreEmpty from "./fixtures/score-empty.json";
import scoreNegative from "./fixtures/score-negative.json";
import scoreRotated from "./fixtures/score-rotated.json";
import scoreSingle from "./fixtures/score-single.json";
import synergyFixture from "./fixtures/tag-synergy.json";

const byId = (types: ItemTypeCore[]) => Object.fromEntries(types.map(t => [t.id, t]));

// Neighbor order is an implementation detail; compare sorted.
const normalize = (r: ScoreResult): ScoreResult => ({
  total: r.total,
  perItem: Object.fromEntries(
    Object.entries(r.perItem).map(([id, e]) => [
      id,
      { ...e, neighbors: [...e.neighbors].sort((a, b) => a.id.localeCompare(b.id)) },
    ]),
  ),
});

const scoreFixtures = [
  ["default", scoreDefault],
  ["rotated", scoreRotated],
  ["negative", scoreNegative],
  ["custom-types", scoreCustom],
  ["empty", scoreEmpty],
  ["single", scoreSingle],
] as const;

describe("calcScore", () => {
  for (const [name, f] of scoreFixtures) {
    it(`matches frozen behavior: ${name}`, () => {
      const got = calcScore(f.placements as Placement[], byId(f.itemTypes as ItemTypeCore[]));
      expect(normalize(got)).toEqual(normalize(f.expected as ScoreResult));
    });
  }
});

describe("tagSynergy", () => {
  const types = synergyFixture.itemTypes as ItemTypeCore[];
  const typesById = byId(types);
  for (const c of synergyFixture.cases) {
    it(`${c.from} -> ${c.to} = ${c.expected}`, () => {
      expect(tagSynergy(typesById[c.from], typesById[c.to])).toBe(c.expected);
    });
  }
});

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
