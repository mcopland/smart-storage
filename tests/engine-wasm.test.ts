import { beforeAll, describe, expect, it } from "vitest";
import { engineScore } from "../src/engine/wasm";
import type { ItemType, Placement, ScoreResult } from "../src/model/types";
import scoreCustom from "./fixtures/score-custom-types.json";
import scoreDefault from "./fixtures/score-default.json";
import scoreEmpty from "./fixtures/score-empty.json";
import scoreNegative from "./fixtures/score-negative.json";
import scoreRotated from "./fixtures/score-rotated.json";
import scoreSingle from "./fixtures/score-single.json";
import { initEngineFromDisk } from "./helpers";

beforeAll(initEngineFromDisk);

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

describe("engineScore", () => {
  for (const [name, f] of scoreFixtures) {
    it(`matches frozen scoring behavior through WASM: ${name}`, () => {
      const got = engineScore({
        itemTypes: f.itemTypes as ItemType[],
        gridW: f.gridW,
        gridH: f.gridH,
        disabledCells: f.disabledCells,
        placements: f.placements as Placement[],
      });
      expect(normalize(got)).toEqual(normalize(f.expected as ScoreResult));
    });
  }

  it("rejects a layout whose placement references an unknown item type", () => {
    expect(() =>
      engineScore({
        itemTypes: [],
        gridW: 4,
        gridH: 4,
        disabledCells: [],
        placements: [{ id: "x1", type: "ghost", x: 0, y: 0, rot: 0 }],
      }),
    ).toThrowError(/ghost/);
  });
});
