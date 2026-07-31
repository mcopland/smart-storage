import { beforeAll, describe, expect, it } from "vitest";
import { createOptimizerSession, type OptimizerProgress } from "../src/engine/optimizerSession";
import { engineScore } from "../src/engine/wasm";
import type { Cell, ItemType, Placement } from "../src/model/types";
import progressShape from "./fixtures/progress-shape.json";
import scoreDefault from "./fixtures/score-default.json";
import { dotLayout, initEngineFromDisk, synergyLayout } from "./helpers";

beforeAll(initEngineFromDisk);

const layout = {
  itemTypes: scoreDefault.itemTypes as ItemType[],
  gridW: scoreDefault.gridW,
  gridH: scoreDefault.gridH,
  disabledCells: scoreDefault.disabledCells,
  placements: scoreDefault.placements as Placement[],
};

function runToCompletion(seed: number, totalIters: number): OptimizerProgress {
  const session = createOptimizerSession(layout, seed, totalIters);
  try {
    for (;;) {
      const progress = session.step(5000);
      if (progress.done) return progress;
    }
  } finally {
    session.free();
  }
}

describe("optimizer session via WASM", () => {
  it("finishes, reports progress, and never scores below the starting layout", () => {
    const initial = engineScore(layout).total;
    const session = createOptimizerSession(layout, 42, 20_000);
    try {
      let last = Number.NEGATIVE_INFINITY;
      for (;;) {
        const progress = session.step(4000);
        expect(progress.score).toBeGreaterThanOrEqual(initial);
        expect(progress.score).toBeGreaterThanOrEqual(last);
        last = progress.score;
        if (progress.done) {
          expect(progress.itersDone).toBe(20_000);
          break;
        }
      }
    } finally {
      session.free();
    }
  });

  it("keeps every placement id and matches engineScore on its result", () => {
    const progress = runToCompletion(7, 15_000);
    expect(progress.placements.map(p => p.id).sort()).toEqual(
      layout.placements.map(p => p.id).sort(),
    );
    const rescored = engineScore({ ...layout, placements: progress.placements });
    expect(rescored.total).toBe(progress.score);
  });

  it("is deterministic for the same seed", () => {
    const a = runToCompletion(1234, 10_000);
    const b = runToCompletion(1234, 10_000);
    expect(a.score).toBe(b.score);
    expect(a.placements).toEqual(b.placements);
  });

  it("rejects a layout whose placement references an unknown item type", () => {
    expect(() =>
      createOptimizerSession(
        { ...layout, placements: [{ id: "x1", type: "ghost", x: 0, y: 0, rot: 0 }] },
        0,
        1000,
      ),
    ).toThrowError(/ghost/);
  });
});

describe("progress wire shape", () => {
  // The runtime object comes from serde via wasm-bindgen; the fixture freezes
  // its shape so a serde rename cannot silently drift from the hand-written
  // EngineProgress/EnginePlacement declarations in wasm.rs. The cargo suite
  // asserts the same fixture (fixtures_test.rs::progress_shape_matches_fixture).
  it("step() returns exactly the frozen EngineProgress keys", () => {
    const session = createOptimizerSession(
      {
        itemTypes: progressShape.itemTypes.map(t => ({
          ...t,
          cells: t.cells.map(([x, y]): Cell => [x, y]),
        })),
        gridW: progressShape.gridW,
        gridH: progressShape.gridH,
        disabledCells: progressShape.disabledCells,
        placements: progressShape.placements as Placement[],
      },
      0,
      100,
    );
    try {
      const progress = session.step(0);
      expect(Object.keys(progress).sort()).toEqual(progressShape.expected.progressKeys);
      expect(progress.placements.length).toBeGreaterThan(0);
      expect(Object.keys(progress.placements[0]).sort()).toEqual(
        progressShape.expected.placementKeys,
      );
    } finally {
      session.free();
    }
  });
});

describe("best_layouts collection", () => {
  // Small dot layout: all arrangements score 0 so every distinct position ties.
  const dots = dotLayout(3, 3, [
    [0, 0],
    [2, 2],
  ]);

  it("progress includes bestLayoutCount >= 1", () => {
    const session = createOptimizerSession(dots, 7, 5_000);
    try {
      let last!: OptimizerProgress;
      for (;;) {
        last = session.step(5_000);
        if (last.done) break;
      }
      expect(last.bestLayoutCount).toBeGreaterThanOrEqual(1);
    } finally {
      session.free();
    }
  });

  it("best_layouts() returns at least one entry and count matches progress", () => {
    const session = createOptimizerSession(dots, 1, 20_000);
    try {
      let last!: OptimizerProgress;
      for (;;) {
        last = session.step(5_000);
        if (last.done) break;
      }
      const bests = session.best_layouts();
      // With composition-based dedup all-zero-synergy dots share one profile
      // (per-type totals are all 0 regardless of adjacency) so only one entry.
      expect(bests.length).toBeGreaterThanOrEqual(1);
      expect(bests.length).toBe(last.bestLayoutCount);
      // Each entry must be a non-empty array of placements.
      for (const group of bests) {
        expect(group.length).toBe(dots.placements.length);
        for (const p of group) {
          expect(p).toHaveProperty("id");
          expect(p).toHaveProperty("type");
        }
      }
    } finally {
      session.free();
    }
  });
});

describe("composition-based dedup", () => {
  // Helper: aggregate perItem bonus by type id -> sorted "type:bonus|..." string.
  function compositionSignature(
    placements: { id: string; type: string }[],
    scoreResult: { perItem: Record<string, { bonus: number }> },
  ): string {
    const typeBonus: Record<string, number> = {};
    for (const p of placements) {
      typeBonus[p.type] = (typeBonus[p.type] ?? 0) + (scoreResult.perItem[p.id]?.bonus ?? 0);
    }
    return Object.entries(typeBonus)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join("|");
  }

  it("best_layouts() contains no duplicate composition profiles", () => {
    // Two items with mutual positive synergy on a 5x1 grid. All adjacent
    // positions yield the same per-type profile {a:+1, b:+1}, so best_layouts()
    // must return exactly one entry.
    const session = createOptimizerSession(synergyLayout, 42, 30_000);
    try {
      let last!: OptimizerProgress;
      for (;;) {
        last = session.step(5_000);
        if (last.done) break;
      }
      const bests = session.best_layouts();
      expect(bests.length).toBeGreaterThanOrEqual(1);
      // Rescore each entry and compute composition signatures.
      const signatures = bests.map(group => {
        const scored = engineScore({ ...synergyLayout, placements: group });
        return compositionSignature(group, scored);
      });
      expect(new Set(signatures).size).toBe(bests.length);
    } finally {
      session.free();
    }
  });

  it("progress includes upperBound and provablyOptimal", () => {
    // For the two-item synergy layout the theoretical max is 2 (both adjacent).
    // Once SA reaches it, provablyOptimal must be true and upperBound >= score.
    const session = createOptimizerSession(synergyLayout, 42, 200_000);
    try {
      let last!: OptimizerProgress;
      for (;;) {
        last = session.step(5_000);
        if (last.done) break;
      }
      expect(last.upperBound).toBeGreaterThanOrEqual(last.score);
      expect(last.provablyOptimal).toBe(last.score >= last.upperBound);
      expect(last.provablyOptimal).toBe(true);
      // Run halted before the full budget because the bound was reached.
      expect(last.itersDone).toBeLessThan(200_000);
    } finally {
      session.free();
    }
  });
});
