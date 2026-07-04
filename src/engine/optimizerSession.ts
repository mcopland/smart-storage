import { Optimizer, type EngineProgress } from "../../crates/engine/pkg/engine";
import type { Placement } from "../model/types";
import type { EngineLayout } from "./wasm";

// The wasm-bindgen boundary types (EngineProgress, EnginePlacement) are
// declared in crates/engine/src/wasm.rs and emitted into pkg/engine.d.ts, so
// the Rust serde shapes and these TS types share one source of truth.
export interface OptimizerProgress extends EngineProgress {
  // Only present in the terminal message (done: true). All distinct layouts
  // that tie the best score, for the Prev/Next browser.
  bestLayouts?: Placement[][];
}

export interface OptimizerSession {
  step(n: number): OptimizerProgress;
  reseat(layout: EngineLayout): void;
  restart_run(): void;
  // Return all tied-best layouts collected during this session.
  best_layouts(): Placement[][];
  free(): void;
}

// Requires an initialized engine (await initEngine() first). The session holds
// WASM-side state, so call free() when done with it.
export function createOptimizerSession(
  layout: EngineLayout,
  seed: number,
  totalIters: number,
): OptimizerSession {
  return new Optimizer(layout, seed, totalIters);
}
