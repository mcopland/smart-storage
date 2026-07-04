//! Typed errors for the engine's fallible model and scoring functions.
//!
//! A panic aborts the whole WASM instance, so anything reachable from the
//! wasm-bindgen boundary must return `Result` instead of panicking.

use thiserror::Error;

/// Errors returned by the engine's model and scoring functions.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum EngineError {
    /// A placement references an item type that is not in the catalog.
    #[error("unknown item type \"{type_id}\" for placement \"{placement_id}\"")]
    UnknownItemType {
        /// The type id the placement referenced.
        type_id: String,
        /// The id of the placement that referenced it.
        placement_id: String,
    },
}
