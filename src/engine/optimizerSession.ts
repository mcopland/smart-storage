import { Optimizer } from "../../crates/engine/pkg/engine";
import type { Placement } from "../model/types";
import type { EngineLayout } from "./wasm";

export interface OptimizerProgress {
  // Best layout found so far (not the current annealing state).
  placements: Placement[];
  score: number;
  done: boolean;
  itersDone: number;
}

export interface OptimizerSession {
  step(n: number): OptimizerProgress;
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
