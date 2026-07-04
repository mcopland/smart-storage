//! Tag-synergy scoring, ported from the original prototype's `data.jsx` /
//! `src/model/score.ts`. Semantics are frozen by the shared JSON fixtures.

use std::collections::{HashMap, HashSet};

use serde::Serialize;

use crate::error::EngineError;
use crate::model::{cells_of, ItemType, Layout};

/// One adjacency contribution as seen by a single item. Serializes to the
/// shape the UI consumes: `{ id, type, delta }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Neighbor {
    /// The adjacent placement's id.
    pub id: String,
    /// The adjacent placement's item-type id (JSON field `type`).
    #[serde(rename = "type")]
    pub type_id: String,
    /// Points this item gains (or loses) from that neighbor.
    pub delta: i32,
}

/// Score breakdown for a single placement.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct PerItem {
    /// Sum of the neighbor deltas.
    pub bonus: i32,
    /// Equals `bonus` today; an extension point for future base scores.
    pub total: i32,
    /// Every adjacent neighbor and its contribution.
    pub neighbors: Vec<Neighbor>,
}

/// The full scoring result: board total plus the per-placement breakdown.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreResult {
    /// Sum of all per-item totals.
    pub total: i32,
    /// Breakdown keyed by placement id.
    pub per_item: HashMap<String, PerItem>,
}

/// Points `from` gains for being adjacent to `to`: each of `from`'s synergy
/// rules whose tag appears in `to`'s tags contributes +1, or -1 when the rule
/// is explicitly negative.
pub fn tag_synergy(from: &ItemType, to: &ItemType) -> i32 {
    if to.tags.is_empty() {
        return 0;
    }
    let tags: HashSet<&str> = to.tags.iter().map(String::as_str).collect();
    from.synergies
        .iter()
        .filter(|s| !s.tag.is_empty() && tags.contains(s.tag.as_str()))
        .map(|s| if s.positive == Some(false) { -1 } else { 1 })
        .sum()
}

/// Total score plus the per-item breakdown (bonus, total, neighbor deltas)
/// across every adjacent pair of placements.
///
/// Uses an occupancy grid instead of all-pairs adjacent() checks so the cost
/// is O(total cells) rather than O(n^2 * cells).
///
/// Errors if a placement references an unknown item type (see
/// [`crate::model::cells_of`]).
pub fn calc_score(layout: &Layout) -> Result<ScoreResult, EngineError> {
    let types = layout.types_by_id();
    // Indexed by placement position, so per-item lookups are infallible; the
    // id-keyed map the UI consumes is built at the end.
    let mut per_item: Vec<PerItem> = vec![PerItem::default(); layout.placements.len()];

    // Compute each placement's cells once, building a reusable cell list and a
    // cell-to-index map in a single pass.
    let all_cells: Vec<Vec<(i32, i32)>> = layout
        .placements
        .iter()
        .map(|p| cells_of(p, &types))
        .collect::<Result<_, _>>()?;
    let mut cell_to_idx: HashMap<(i32, i32), usize> = HashMap::new();
    for (i, cells) in all_cells.iter().enumerate() {
        for &cell in cells {
            cell_to_idx.insert(cell, i);
        }
    }

    // Scan each cell's 4-neighborhood; process each adjacent pair exactly once.
    let mut seen_pairs: HashSet<(usize, usize)> = HashSet::new();
    for (i, cells) in all_cells.iter().enumerate() {
        for &(cx, cy) in cells {
            for (nx, ny) in [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)] {
                let Some(&j) = cell_to_idx.get(&(nx, ny)) else {
                    continue;
                };
                if i == j {
                    continue;
                }
                if !seen_pairs.insert((i.min(j), i.max(j))) {
                    continue;
                }
                // Process pair in index order (matching the former i < j loop).
                let (ai, bi) = if i < j { (i, j) } else { (j, i) };
                let a = &layout.placements[ai];
                let b = &layout.placements[bi];
                let ta = types[a.type_id.as_str()];
                let tb = types[b.type_id.as_str()];
                let da = tag_synergy(ta, tb);
                let db = tag_synergy(tb, ta);
                per_item[ai].bonus += da;
                per_item[ai].neighbors.push(Neighbor {
                    id: b.id.clone(),
                    type_id: b.type_id.clone(),
                    delta: da,
                });
                per_item[bi].bonus += db;
                per_item[bi].neighbors.push(Neighbor {
                    id: a.id.clone(),
                    type_id: a.type_id.clone(),
                    delta: db,
                });
            }
        }
    }

    let mut total = 0;
    let mut by_id: HashMap<String, PerItem> = HashMap::with_capacity(per_item.len());
    for (p, mut item) in layout.placements.iter().zip(per_item) {
        // total equals bonus today; it exists as an extension point for future
        // base scores or per-item penalty terms.
        item.total = item.bonus;
        total += item.total;
        by_id.insert(p.id.clone(), item);
    }
    Ok(ScoreResult {
        total,
        per_item: by_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Layout, Placement};

    #[test]
    fn calc_score_errors_on_unknown_type() {
        let layout = Layout {
            item_types: vec![],
            grid_w: 3,
            grid_h: 3,
            disabled_cells: vec![],
            placements: vec![Placement {
                id: "p1".to_string(),
                type_id: "ghost".to_string(),
                x: 0,
                y: 0,
                rot: 0,
            }],
        };
        let err = calc_score(&layout).expect_err("unknown type must be an error, not a panic");
        let msg = err.to_string();
        assert!(
            msg.contains("ghost") && msg.contains("p1"),
            "error must name the type and placement, got: {msg}"
        );
    }
}
