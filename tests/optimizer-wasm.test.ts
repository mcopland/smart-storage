import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { createOptimizerSession, type OptimizerProgress } from "../src/engine/optimizerSession";
import { engineScore, initEngine } from "../src/engine/wasm";
import type { ItemType, Placement } from "../src/model/types";
import scoreDefault from "./fixtures/score-default.json";

beforeAll(async () => {
  const wasmUrl = new URL("../crates/engine/pkg/engine_bg.wasm", import.meta.url);
  await initEngine(await readFile(wasmUrl));
});

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
