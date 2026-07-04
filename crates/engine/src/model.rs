//! Data model and grid geometry, ported from the original prototype's
//! `data.jsx` / `src/model/geometry.ts`. Semantics are frozen by the shared
//! JSON fixtures in `tests/fixtures/`.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::error::EngineError;

/// A cell offset or absolute grid position, deserialized from JSON `[x, y]`.
pub type Cell = (i32, i32);

/// One scoring rule: an item with this rule gains a point per adjacent
/// neighbor carrying `tag` (or loses one when the rule is negative).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Synergy {
    /// The neighbor tag this rule reacts to.
    pub tag: String,
    /// `Some(false)` scores -1; `None` or `Some(true)` scores +1, matching the
    /// JS rule `positive === false ? -1 : 1`.
    #[serde(default)]
    pub positive: Option<bool>,
}

/// An item-type definition: identity, tags, synergy rules, and shape.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ItemType {
    /// Unique type id referenced by `Placement::type_id`.
    pub id: String,
    /// Tags this type carries (what neighbors' synergy rules match against).
    pub tags: Vec<String>,
    /// Scoring rules applied per adjacent neighbor.
    pub synergies: Vec<Synergy>,
    /// Shape as cell offsets from the type's origin, unrotated.
    pub cells: Vec<Cell>,
}

/// One placed item instance: which type sits where, at which rotation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Placement {
    /// Unique placement id.
    pub id: String,
    /// The `ItemType::id` this placement instantiates (JSON field `type`).
    #[serde(rename = "type")]
    pub type_id: String,
    /// Grid x of the shape's origin cell.
    pub x: i32,
    /// Grid y of the shape's origin cell.
    pub y: i32,
    /// Clockwise rotation in degrees; any multiple of 90.
    pub rot: i32,
}

/// A complete board state: the item-type catalog plus grid and placements.
/// Field names follow the JSON wire format used by the TypeScript app.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
    /// The item-type catalog placements reference by id.
    pub item_types: Vec<ItemType>,
    /// Grid width in cells.
    pub grid_w: i32,
    /// Grid height in cells.
    pub grid_h: i32,
    /// Disabled cells as `"x,y"` strings, the app's native key format.
    #[serde(default)]
    pub disabled_cells: Vec<String>,
    /// The placed items.
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
/// Errors if the placement references an unknown item type (a panic here
/// would abort the WASM instance); TypeScript's `getShapeCells` throws on the
/// same invariant violation.
pub fn cells_of(
    p: &Placement,
    types_by_id: &HashMap<&str, &ItemType>,
) -> Result<Vec<Cell>, EngineError> {
    let t = types_by_id
        .get(p.type_id.as_str())
        .ok_or_else(|| EngineError::UnknownItemType {
            type_id: p.type_id.clone(),
            placement_id: p.id.clone(),
        })?;
    Ok(rotate_cells(&t.cells, p.rot)
        .into_iter()
        .map(|(dx, dy)| (p.x + dx, p.y + dy))
        .collect())
}

/// Whether two placements touch orthogonally (share a cell edge).
pub fn adjacent(
    a: &Placement,
    b: &Placement,
    types_by_id: &HashMap<&str, &ItemType>,
) -> Result<bool, EngineError> {
    let cells_b: HashSet<Cell> = cells_of(b, types_by_id)?.into_iter().collect();
    Ok(cells_of(a, types_by_id)?.iter().any(|&(ax, ay)| {
        cells_b.contains(&(ax + 1, ay))
            || cells_b.contains(&(ax - 1, ay))
            || cells_b.contains(&(ax, ay + 1))
            || cells_b.contains(&(ax, ay - 1))
    }))
}

impl Layout {
    /// Borrowed id -> item-type lookup over the catalog.
    pub fn types_by_id(&self) -> HashMap<&str, &ItemType> {
        self.item_types.iter().map(|t| (t.id.as_str(), t)).collect()
    }

    /// Whether `p` can be placed: in bounds, not overlapping any other
    /// placement (excluding `ignore_id`), and not on a disabled cell.
    ///
    /// Errors if `p` or any existing placement references an unknown type.
    pub fn fits(&self, p: &Placement, ignore_id: Option<&str>) -> Result<bool, EngineError> {
        let types = self.types_by_id();
        let cells = cells_of(p, &types)?;
        if cells
            .iter()
            .any(|&(cx, cy)| cx < 0 || cy < 0 || cx >= self.grid_w || cy >= self.grid_h)
        {
            return Ok(false);
        }
        let disabled: HashSet<&str> = self.disabled_cells.iter().map(String::as_str).collect();
        let mut occupied: HashSet<Cell> = HashSet::new();
        for q in self
            .placements
            .iter()
            .filter(|q| Some(q.id.as_str()) != ignore_id)
        {
            occupied.extend(cells_of(q, &types)?);
        }
        Ok(cells.iter().all(|&(cx, cy)| {
            !occupied.contains(&(cx, cy)) && !disabled.contains(format!("{cx},{cy}").as_str())
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::EngineError;

    fn domino(id: &str) -> ItemType {
        ItemType {
            id: id.to_string(),
            tags: vec![],
            synergies: vec![],
            cells: vec![(0, 0), (1, 0)],
        }
    }

    fn placement(id: &str, type_id: &str, x: i32, y: i32) -> Placement {
        Placement {
            id: id.to_string(),
            type_id: type_id.to_string(),
            x,
            y,
            rot: 0,
        }
    }

    #[test]
    fn cells_of_returns_absolute_cells_for_known_type() {
        let t = domino("a");
        let types = HashMap::from([("a", &t)]);
        let cells = cells_of(&placement("p1", "a", 2, 3), &types).expect("known type must resolve");
        assert_eq!(cells, vec![(2, 3), (3, 3)]);
    }

    #[test]
    fn cells_of_errors_on_unknown_type() {
        let types: HashMap<&str, &ItemType> = HashMap::new();
        let err = cells_of(&placement("p1", "ghost", 0, 0), &types)
            .expect_err("unknown type must be an error, not a panic");
        assert_eq!(
            err,
            EngineError::UnknownItemType {
                type_id: "ghost".to_string(),
                placement_id: "p1".to_string(),
            }
        );
    }

    #[test]
    fn adjacent_errors_on_unknown_type() {
        let t = domino("a");
        let types = HashMap::from([("a", &t)]);
        let known = placement("p1", "a", 0, 0);
        let unknown = placement("p2", "ghost", 0, 1);
        assert!(adjacent(&known, &unknown, &types).is_err());
        assert!(adjacent(&unknown, &known, &types).is_err());
    }

    #[test]
    fn fits_errors_on_unknown_type() {
        let layout = Layout {
            item_types: vec![domino("a")],
            grid_w: 4,
            grid_h: 4,
            disabled_cells: vec![],
            placements: vec![],
        };
        let err = layout
            .fits(&placement("p1", "ghost", 0, 0), None)
            .expect_err("unknown type must be an error, not a panic");
        assert!(
            err.to_string().contains("ghost") && err.to_string().contains("p1"),
            "error must name the type and placement, got: {err}"
        );
    }

    #[test]
    fn fits_errors_when_an_existing_placement_has_unknown_type() {
        let layout = Layout {
            item_types: vec![domino("a")],
            grid_w: 4,
            grid_h: 4,
            disabled_cells: vec![],
            placements: vec![placement("p1", "ghost", 0, 0)],
        };
        assert!(layout.fits(&placement("p2", "a", 2, 2), None).is_err());
    }
}
