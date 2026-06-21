//! Tag-synergy scoring, ported from the original prototype's `data.jsx` /
//! `src/model/score.ts`. Semantics are frozen by the shared JSON fixtures.

use std::collections::{HashMap, HashSet};

use serde::Serialize;

use crate::model::{cells_of, ItemType, Layout};

/// One adjacency contribution as seen by a single item. Serializes to the
/// shape the UI consumes: `{ id, type, delta }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Neighbor {
    pub id: String,
    #[serde(rename = "type")]
    pub type_id: String,
    pub delta: i32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct PerItem {
    pub bonus: i32,
    pub total: i32,
    pub neighbors: Vec<Neighbor>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreResult {
    pub total: i32,
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
/// Panics if a placement references an unknown item type (see
/// [`crate::model::cells_of`]).
pub fn calc_score(layout: &Layout) -> ScoreResult {
    let types = layout.types_by_id();
    let mut per_item: HashMap<String, PerItem> = layout
        .placements
        .iter()
        .map(|p| (p.id.clone(), PerItem::default()))
        .collect();

    // Compute each placement's cells once, building a reusable cell list and a
    // cell-to-index map in a single pass.
    let all_cells: Vec<Vec<(i32, i32)>> = layout
        .placements
        .iter()
        .map(|p| cells_of(p, &types))
        .collect();
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
                let entry_a = per_item.get_mut(&a.id).unwrap_or_else(|| {
                    panic!("calc_score: missing per-item entry for \"{}\"", a.id)
                });
                entry_a.bonus += da;
                entry_a.neighbors.push(Neighbor {
                    id: b.id.clone(),
                    type_id: b.type_id.clone(),
                    delta: da,
                });
                let entry_b = per_item.get_mut(&b.id).unwrap_or_else(|| {
                    panic!("calc_score: missing per-item entry for \"{}\"", b.id)
                });
                entry_b.bonus += db;
                entry_b.neighbors.push(Neighbor {
                    id: a.id.clone(),
                    type_id: a.type_id.clone(),
                    delta: db,
                });
            }
        }
    }

    let mut total = 0;
    for item in per_item.values_mut() {
        // total equals bonus today; it exists as an extension point for future
        // base scores or per-item penalty terms.
        item.total = item.bonus;
        total += item.total;
    }
    ScoreResult { total, per_item }
}
