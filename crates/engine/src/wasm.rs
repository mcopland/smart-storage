//! wasm-bindgen bindings. Layouts cross the boundary as plain JS objects in
//! the app's JSON wire format; results come back as plain objects too (the
//! `json_compatible` serializer keeps maps as objects rather than JS `Map`s).

use serde::Serialize;
use wasm_bindgen::prelude::*;

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
