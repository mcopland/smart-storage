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

    /// The layout's grid has a non-positive dimension, so no cell is valid.
    #[error("invalid grid size {w}x{h}")]
    InvalidGrid {
        /// The grid width that was rejected.
        w: i32,
        /// The grid height that was rejected.
        h: i32,
    },

    /// More placements than the occupancy grid's `u16` index can address.
    #[error("too many placements ({0}); the occupancy grid indexes with u16")]
    TooManyPlacements(usize),

    /// A disabled-cell key was not the expected `"x,y"` integer pair.
    #[error("malformed disabled cell key \"{0}\"")]
    MalformedDisabledCell(String),

    /// A placement does not fit where the layout puts it.
    #[error("placement \"{placement_id}\" is out of bounds or overlaps")]
    IllegalPlacement {
        /// The id of the placement that does not fit.
        placement_id: String,
    },

    /// A reseat layout omitted a placement the session is tracking. The session
    /// keys placements by id, so it cannot reseat onto a different id set.
    #[error("placement \"{placement_id}\" missing from the reseat layout")]
    ReseatMissingPlacement {
        /// The id the session expected to find.
        placement_id: String,
    },
}
