//! The smart-storage engine: the data model, tag-synergy scoring, and the
//! simulated-annealing optimizer, compiled both natively (for `cargo test`)
//! and to WebAssembly (via `wasm.rs`) as the app's single source of truth for
//! score semantics.
#![warn(missing_docs)]

pub mod anneal;
pub mod error;
pub mod model;
pub mod score;
pub mod wasm;
