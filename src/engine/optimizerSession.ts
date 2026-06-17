import { Optimizer } from "../../crates/engine/pkg/engine";
import type { Placement } from "../model/types";
import type { EngineLayout } from "./wasm";

export interface OptimizerProgress {
  // Best layout found so far (not the current annealing state).
  placements: Placement[];
  score: number;
  done: boolean;
  itersDone: number;
  // Distinct layouts evaluated across all runs in this session.
  explored: number;
  // True when the most recently completed run found zero new layouts.
  stalled: boolean;
}

export interface OptimizerSession {
  step(n: number): OptimizerProgress;
  reseat(layout: EngineLayout): void;
  restart_run(): void;
  free(): void;
}

// Requires an initialized engine (await initEngine() first). The session holds
// WASM-side state, so call free() when done with it.
export function createOptimizerSession(
  layout: EngineLayout,
  seed: number,
  totalIters: number,
): OptimizerSession {
  return new Optimizer(layout, seed, totalIters) as unknown as OptimizerSession;
}
