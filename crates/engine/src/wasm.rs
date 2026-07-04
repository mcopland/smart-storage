//! wasm-bindgen bindings. Layouts cross the boundary as plain JS objects in
//! the app's JSON wire format; results come back as plain objects too (the
//! `json_compatible` serializer keeps maps as objects rather than JS `Map`s).

use serde::Serialize;
use wasm_bindgen::prelude::*;

use crate::anneal::OptimizerSession;
use crate::model::Layout;
use crate::score::calc_score;

/// TypeScript declarations for the plain objects crossing the boundary.
/// These must mirror the serde shapes: `model::Placement` and the camelCase
/// serializations of `score::ScoreResult` and `anneal::Progress`.
#[wasm_bindgen(typescript_custom_section)]
const ENGINE_TYPES: &'static str = r#"
export interface EnginePlacement {
  id: string;
  type: string;
  x: number;
  y: number;
  rot: number;
}

export interface EngineNeighbor {
  id: string;
  type: string;
  delta: number;
}

export interface EnginePerItem {
  bonus: number;
  total: number;
  neighbors: EngineNeighbor[];
}

export interface EngineScoreResult {
  total: number;
  perItem: Record<string, EnginePerItem>;
}

export interface EngineProgress {
  placements: EnginePlacement[];
  score: number;
  done: boolean;
  itersDone: number;
  explored: number;
  stalled: boolean;
  bestLayoutCount: number;
  upperBound: number;
  provablyOptimal: boolean;
}
"#;

#[wasm_bindgen(unchecked_return_type = "EngineScoreResult")]
pub fn score(layout: JsValue) -> Result<JsValue, JsValue> {
    let layout: Layout = serde_wasm_bindgen::from_value(layout)
        .map_err(|e| JsValue::from_str(&format!("score: failed to parse layout: {e}")))?;
    calc_score(&layout)
        .map_err(|e| JsValue::from_str(&format!("score: {e}")))?
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|e| JsValue::from_str(&format!("score: failed to serialize result: {e}")))
}

/// Chunked simulated-annealing session over a layout's placements.
#[wasm_bindgen]
pub struct Optimizer {
    session: OptimizerSession,
}

#[wasm_bindgen]
impl Optimizer {
    #[wasm_bindgen(constructor)]
    pub fn new(layout: JsValue, seed: u32, total_iters: u32) -> Result<Optimizer, JsValue> {
        let layout: Layout = serde_wasm_bindgen::from_value(layout)
            .map_err(|e| JsValue::from_str(&format!("optimizer: failed to parse layout: {e}")))?;
        let session =
            OptimizerSession::new(&layout, seed, total_iters).map_err(|e| JsValue::from_str(&e))?;
        Ok(Optimizer { session })
    }

    /// Run up to `n` more iterations; returns an `EngineProgress` snapshot.
    #[wasm_bindgen(unchecked_return_type = "EngineProgress")]
    pub fn step(&mut self, n: u32) -> Result<JsValue, JsValue> {
        self.session
            .step(n)
            .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|e| {
                JsValue::from_str(&format!("optimizer: failed to serialize progress: {e}"))
            })
    }

    /// Update the current layout without clearing the visited set.
    /// The new layout must contain the same placement ids.
    pub fn reseat(&mut self, layout: JsValue) -> Result<(), JsValue> {
        let layout: Layout = serde_wasm_bindgen::from_value(layout).map_err(|e| {
            JsValue::from_str(&format!("optimizer reseat: failed to parse layout: {e}"))
        })?;
        self.session
            .reseat(&layout)
            .map_err(|e| JsValue::from_str(&e))
    }

    /// Reset per-run counters (temperature, stagnation, run-visited count) so
    /// the next `step` loop re-anneals from scratch while keeping the visited
    /// set and the best layout found so far.
    pub fn restart_run(&mut self) {
        self.session.restart_run();
    }

    /// Return all distinct layouts that tie the current best score as an array
    /// of placement arrays.
    #[wasm_bindgen(unchecked_return_type = "EnginePlacement[][]")]
    pub fn best_layouts(&self) -> Result<JsValue, JsValue> {
        self.session
            .best_layouts()
            .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|e| {
                JsValue::from_str(&format!("optimizer: failed to serialize best_layouts: {e}"))
            })
    }
}
