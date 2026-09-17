import initWasm, { score } from "../../crates/engine/pkg/engine";
import type { ItemTypeCore, Placement, ScoreResult } from "../model/types";

// The layout shape the Rust engine deserializes (its JSON wire format).
// Extra fields on item types (name, color, ...) are ignored by serde.
export interface EngineLayout {
  itemTypes: ItemTypeCore[];
  gridW: number;
  gridH: number;
  // Irrelevant to scoring (only to placement legality); may be omitted.
  disabledCells?: string[];
  placements: Placement[];
}

let initPromise: Promise<void> | null = null;
let initialized = false;

// In the browser the wasm asset resolves relative to the generated module; in
// Node (Vitest) pass the compiled bytes explicitly.
//
// The in-flight promise is what's cached, not a flag set after the await: the
// worker can receive two messages before the first init resolves, and a flag
// would let both instantiate the module. A session built against one instance
// driven through the other reads unrelated memory.
export async function initEngine(wasmBytes?: BufferSource): Promise<void> {
  initPromise ??= initWasm(wasmBytes !== undefined ? { module_or_path: wasmBytes } : undefined)
    .then(() => {
      initialized = true;
    })
    .catch((err: unknown) => {
      // Drop the cache rather than hand every later caller the same rejection.
      initPromise = null;
      throw err;
    });
  return initPromise;
}

// Synchronous scoring call into the Rust engine; the engine is the single
// source of truth for score semantics.
export function engineScore(layout: EngineLayout): ScoreResult {
  if (!initialized) {
    throw new Error("engineScore: WASM engine not initialized; await initEngine() first");
  }
  return score(layout);
}
