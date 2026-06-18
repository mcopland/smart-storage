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
  // Number of distinct tied-best layouts collected so far.
  bestLayoutCount: number;
  // Provable upper bound on the achievable score, computed at session construction.
  upperBound: number;
  // True when score equals upperBound: the best found score is provably optimal.
  provablyOptimal: boolean;
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
  return new Optimizer(layout, seed, totalIters) as unknown as OptimizerSession;
}
