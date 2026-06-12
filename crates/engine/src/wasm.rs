//! wasm-bindgen bindings. Layouts cross the boundary as plain JS objects in
//! the app's JSON wire format; results come back as plain objects too (the
//! `json_compatible` serializer keeps maps as objects rather than JS `Map`s).

use serde::Serialize;
use wasm_bindgen::prelude::*;

use crate::anneal::OptimizerSession;
use crate::model::Layout;
use crate::score::calc_score;

#[wasm_bindgen]
pub fn score(layout: JsValue) -> Result<JsValue, JsValue> {
    let layout: Layout = serde_wasm_bindgen::from_value(layout)
        .map_err(|e| JsValue::from_str(&format!("score: failed to parse layout: {e}")))?;
    // Reject unknown item types up front: calc_score treats them as an
    // invariant violation and panics, which would abort the wasm instance.
    let types = layout.types_by_id();
    for p in &layout.placements {
        if !types.contains_key(p.type_id.as_str()) {
            return Err(JsValue::from_str(&format!(
                "score: unknown item type \"{}\" for placement \"{}\"",
                p.type_id, p.id
            )));
        }
    }
    calc_score(&layout)
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

    /// Run up to `n` more iterations; returns `{ placements, score, done, itersDone }`.
    pub fn step(&mut self, n: u32) -> Result<JsValue, JsValue> {
        self.session
            .step(n)
            .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|e| {
                JsValue::from_str(&format!("optimizer: failed to serialize progress: {e}"))
            })
    }
}
