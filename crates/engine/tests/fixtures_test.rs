//! Parity tests against the JSON fixtures shared with the TypeScript suite.
//! The fixtures freeze the original prototype's behavior; the Rust engine must
//! reproduce it exactly.

use std::collections::HashMap;
use std::path::PathBuf;

use engine::model::{rotate_cells, Cell, Layout, Placement};
use engine::score::calc_score;

use serde::Deserialize;

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixtures")
        .join(name)
}

fn load<T: for<'de> Deserialize<'de>>(name: &str) -> T {
    let path = fixture_path(name);
    let data = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("failed to read fixture {}: {e}", path.display()));
    serde_json::from_str(&data)
        .unwrap_or_else(|e| panic!("failed to parse fixture {}: {e}", path.display()))
}

// --- rotation ---

#[derive(Deserialize)]
struct RotationFixture {
    cases: Vec<RotationCase>,
}

#[derive(Deserialize)]
struct RotationCase {
    name: String,
    cells: Vec<Cell>,
    rot: i32,
    expected: Vec<Cell>,
}

#[test]
fn rotate_cells_matches_fixtures() {
    let fixture: RotationFixture = load("rotations.json");
    for case in fixture.cases {
        assert_eq!(
            rotate_cells(&case.cells, case.rot),
            case.expected,
            "shape {} rotated by {}",
            case.name,
            case.rot
        );
    }
}

// --- fits ---

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FitsFixture {
    #[serde(flatten)]
    layout: Layout,
    cases: Vec<FitsCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FitsCase {
    placement: Placement,
    ignore_id: String,
    expected: bool,
}

#[test]
fn fits_matches_fixtures() {
    let fixture: FitsFixture = load("fits.json");
    for (i, case) in fixture.cases.iter().enumerate() {
        assert_eq!(
            fixture
                .layout
                .fits(&case.placement, Some(&case.ignore_id))
                .expect("fixture layouts reference only known types"),
            case.expected,
            "fits case {i}: {} at ({}, {}) rot {}",
            case.placement.type_id,
            case.placement.x,
            case.placement.y,
            case.placement.rot
        );
    }
}

// --- tag synergy ---

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SynergyFixture {
    item_types: Vec<engine::model::ItemType>,
    cases: Vec<SynergyCase>,
}

#[derive(Deserialize)]
struct SynergyCase {
    from: String,
    to: String,
    expected: i32,
}

#[test]
fn tag_synergy_matches_fixtures() {
    let fixture: SynergyFixture = load("tag-synergy.json");
    let by_id: HashMap<&str, &engine::model::ItemType> = fixture
        .item_types
        .iter()
        .map(|t| (t.id.as_str(), t))
        .collect();
    for case in &fixture.cases {
        let from = by_id[case.from.as_str()];
        let to = by_id[case.to.as_str()];
        assert_eq!(
            engine::score::tag_synergy(from, to),
            case.expected,
            "tag_synergy({} -> {})",
            case.from,
            case.to
        );
    }
}

// --- score ---

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScoreFixture {
    #[serde(flatten)]
    layout: Layout,
    expected: ExpectedScore,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpectedScore {
    total: i32,
    per_item: HashMap<String, ExpectedPerItem>,
}

#[derive(Deserialize)]
struct ExpectedPerItem {
    bonus: i32,
    total: i32,
    neighbors: Vec<ExpectedNeighbor>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpectedNeighbor {
    id: String,
    #[serde(rename = "type")]
    type_id: String,
    delta: i32,
}

fn assert_score_fixture(name: &str) {
    let fixture: ScoreFixture = load(name);
    let result = calc_score(&fixture.layout)
        .unwrap_or_else(|e| panic!("{name}: fixture layout must score: {e}"));
    assert_eq!(result.total, fixture.expected.total, "{name}: total");
    assert_eq!(
        result.per_item.len(),
        fixture.expected.per_item.len(),
        "{name}: per-item entry count"
    );
    for (id, expected) in &fixture.expected.per_item {
        let got = result
            .per_item
            .get(id)
            .unwrap_or_else(|| panic!("{name}: missing per-item entry for {id}"));
        assert_eq!(got.bonus, expected.bonus, "{name}: bonus for {id}");
        assert_eq!(got.total, expected.total, "{name}: total for {id}");
        // Neighbor order is an implementation detail; compare sorted by id.
        let mut got_neighbors: Vec<(String, String, i32)> = got
            .neighbors
            .iter()
            .map(|n| (n.id.clone(), n.type_id.clone(), n.delta))
            .collect();
        got_neighbors.sort();
        let mut expected_neighbors: Vec<(String, String, i32)> = expected
            .neighbors
            .iter()
            .map(|n| (n.id.clone(), n.type_id.clone(), n.delta))
            .collect();
        expected_neighbors.sort();
        assert_eq!(
            got_neighbors, expected_neighbors,
            "{name}: neighbors for {id}"
        );
    }
}

#[test]
fn score_default_layout() {
    assert_score_fixture("score-default.json");
}

#[test]
fn score_rotated_layout() {
    assert_score_fixture("score-rotated.json");
}

#[test]
fn score_negative_layout() {
    assert_score_fixture("score-negative.json");
}

#[test]
fn score_custom_types_layout() {
    assert_score_fixture("score-custom-types.json");
}

#[test]
fn score_empty_layout() {
    assert_score_fixture("score-empty.json");
}

#[test]
fn score_single_layout() {
    assert_score_fixture("score-single.json");
}
