//! Data model and grid geometry, ported from the original prototype's
//! `data.jsx` / `src/model/geometry.ts`. Semantics are frozen by the shared
//! JSON fixtures in `tests/fixtures/`.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

/// A cell offset or absolute grid position, deserialized from JSON `[x, y]`.
pub type Cell = (i32, i32);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Synergy {
    pub tag: String,
    /// `Some(false)` scores -1; `None` or `Some(true)` scores +1, matching the
    /// JS rule `positive === false ? -1 : 1`.
    #[serde(default)]
    pub positive: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ItemType {
    pub id: String,
    pub tags: Vec<String>,
    pub synergies: Vec<Synergy>,
    pub cells: Vec<Cell>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Placement {
    pub id: String,
    #[serde(rename = "type")]
    pub type_id: String,
    pub x: i32,
    pub y: i32,
    pub rot: i32,
}

/// A complete board state: the item-type catalog plus grid and placements.
/// Field names follow the JSON wire format used by the TypeScript app.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
    pub item_types: Vec<ItemType>,
    pub grid_w: i32,
    pub grid_h: i32,
    /// Disabled cells as `"x,y"` strings, the app's native key format.
    #[serde(default)]
    pub disabled_cells: Vec<String>,
    pub placements: Vec<Placement>,
}

/// Rotate cell offsets by a multiple of 90 degrees CW, normalizing the result
/// so its bounding box starts at the origin. Per 90-degree step:
/// `(x, y) -> (maxY - y, x)`.
pub fn rotate_cells(base_cells: &[Cell], rot: i32) -> Vec<Cell> {
    let mut cells: Vec<Cell> = base_cells.to_vec();
    let times = rot.rem_euclid(360) / 90;
    for _ in 0..times {
        let max_y = cells.iter().map(|c| c.1).max().unwrap_or(0);
        cells = cells.iter().map(|&(x, y)| (max_y - y, x)).collect();
    }
    let min_x = cells.iter().map(|c| c.0).min().unwrap_or(0);
    let min_y = cells.iter().map(|c| c.1).min().unwrap_or(0);
    cells.iter().map(|&(x, y)| (x - min_x, y - min_y)).collect()
}

/// Absolute grid cells covered by a placement.
///
/// Panics if the placement references an unknown item type, the same
/// invariant violation `getShapeCells` throws on in TypeScript.
pub fn cells_of(p: &Placement, types_by_id: &HashMap<&str, &ItemType>) -> Vec<Cell> {
    let t = types_by_id.get(p.type_id.as_str()).unwrap_or_else(|| {
        panic!(
            "cells_of: unknown item type \"{}\" for placement \"{}\"",
            p.type_id, p.id
        )
    });
    rotate_cells(&t.cells, p.rot)
        .into_iter()
        .map(|(dx, dy)| (p.x + dx, p.y + dy))
        .collect()
}

/// Whether two placements touch orthogonally (share a cell edge).
pub fn adjacent(a: &Placement, b: &Placement, types_by_id: &HashMap<&str, &ItemType>) -> bool {
    let cells_b: HashSet<Cell> = cells_of(b, types_by_id).into_iter().collect();
    cells_of(a, types_by_id).iter().any(|&(ax, ay)| {
        cells_b.contains(&(ax + 1, ay))
            || cells_b.contains(&(ax - 1, ay))
            || cells_b.contains(&(ax, ay + 1))
            || cells_b.contains(&(ax, ay - 1))
    })
}

impl Layout {
    pub fn types_by_id(&self) -> HashMap<&str, &ItemType> {
        self.item_types.iter().map(|t| (t.id.as_str(), t)).collect()
    }

    /// Whether `p` can be placed: in bounds, not overlapping any other
    /// placement (excluding `ignore_id`), and not on a disabled cell.
    pub fn fits(&self, p: &Placement, ignore_id: Option<&str>) -> bool {
        let types = self.types_by_id();
        let cells = cells_of(p, &types);
        if cells
            .iter()
            .any(|&(cx, cy)| cx < 0 || cy < 0 || cx >= self.grid_w || cy >= self.grid_h)
        {
            return false;
        }
        let disabled: HashSet<&str> = self.disabled_cells.iter().map(String::as_str).collect();
        let occupied: HashSet<Cell> = self
            .placements
            .iter()
            .filter(|q| Some(q.id.as_str()) != ignore_id)
            .flat_map(|q| cells_of(q, &types))
            .collect();
        cells.iter().all(|&(cx, cy)| {
            !occupied.contains(&(cx, cy)) && !disabled.contains(format!("{cx},{cy}").as_str())
        })
    }
}
