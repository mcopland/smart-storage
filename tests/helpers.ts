// Shared fixtures and setup for the WASM-backed test suites.
import { readFile } from "node:fs/promises";
import { initEngine, type EngineLayout } from "../src/engine/wasm";
import type { Cell, Placement } from "../src/model/types";

// Node has no fetch path to the wasm asset; load the compiled bytes from disk.
export async function initEngineFromDisk(): Promise<void> {
  const wasmUrl = new URL("../crates/engine/pkg/engine_bg.wasm", import.meta.url);
  await initEngine(await readFile(wasmUrl));
}

// Two single-cell items with mutual positive synergy on a 5x1 strip: small
// space, provably-optimal score 2, so runs terminate fast and deterministically.
export const synergyLayout: EngineLayout = {
  itemTypes: [
    {
      id: "a",
      tags: ["x"],
      synergies: [{ tag: "x", positive: true }],
      cells: [[0, 0]],
    },
    {
      id: "b",
      tags: ["x"],
      synergies: [{ tag: "x", positive: true }],
      cells: [[0, 0]],
    },
  ],
  gridW: 5,
  gridH: 1,
  disabledCells: [],
  placements: [
    { id: "p0", type: "a", x: 0, y: 0, rot: 0 },
    { id: "p1", type: "b", x: 4, y: 0, rot: 0 },
  ],
};

// Single-cell items with no tags or synergies: every arrangement scores 0, so
// all distinct positions tie. The upper bound is 0 too, which the engine now
// treats as a real bound -- these layouts certify as provably optimal on the
// first step. Use clusterLayout for a run that keeps going.
export function dotLayout(gridW: number, gridH: number, positions: Cell[]): EngineLayout {
  const placements: Placement[] = positions.map(([x, y], i) => ({
    id: `p${i}`,
    type: "dot",
    x,
    y,
    rot: 0,
  }));
  return {
    itemTypes: [{ id: "dot", tags: [], synergies: [], cells: [[0, 0]] }],
    gridW,
    gridH,
    disabledCells: [],
    placements,
  };
}

// Single-cell items with a mutual positive synergy. The upper bound relaxes
// away geometry (it lets every item claim its best four neighbours at once),
// so it sits well above what the pieces can actually achieve packed on a grid
// -- the run never certifies, and the space is far too large to stall in a few
// small budgets. The fixture for "this run keeps going".
export function clusterLayout(gridW: number, gridH: number, positions: Cell[]): EngineLayout {
  const placements: Placement[] = positions.map(([x, y], i) => ({
    id: `p${i}`,
    type: "node",
    x,
    y,
    rot: 0,
  }));
  return {
    itemTypes: [
      { id: "node", tags: ["x"], synergies: [{ tag: "x", positive: true }], cells: [[0, 0]] },
    ],
    gridW,
    gridH,
    disabledCells: [],
    placements,
  };
}
