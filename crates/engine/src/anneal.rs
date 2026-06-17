//! Simulated-annealing optimizer over the positions and rotations of already
//! placed items. Item types, inventory, grid size, and disabled cells are
//! fixed inputs; every intermediate state is a legal layout.
//!
//! The session is chunked (`step(n)`) so a Web Worker can post progress and
//! honor cancellation between chunks instead of blocking in one long call.
//!
//! A `HashSet<u64>` visited registry counts distinct layouts encountered.
//! Revisiting an already-seen layout is intentionally allowed -- the walk
//! must be free to pass through familiar states to reach unexplored regions
//! (ergodicity). Revisits simply do not increment the counter.
//! `restart_run` resets the per-run counters (temperature, stagnation) while
//! keeping the cross-run visited set so successive presses of Optimize cover
//! new ground. `reseat` updates the current position from a new Layout (e.g.
//! after a manual move) while also preserving the visited set.

use std::collections::HashSet;

use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};
use serde::Serialize;

use crate::model::{Cell, Layout, Placement, rotate_cells};
use crate::score::{calc_score, tag_synergy};

const T_START: f64 = 3.0;
const T_END: f64 = 0.05;

/// Cap on visited-set size to bound memory (~8 MB at u64 with typical load
/// factor). Once reached, the set is no longer updated but still consulted so
/// already-seen layouts continue to be rejected.
const MAX_VISITED: usize = 1_000_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    /// Best layout found so far (not the current annealing state).
    pub placements: Vec<Placement>,
    pub score: i32,
    pub done: bool,
    pub iters_done: u32,
    /// Distinct layouts evaluated across all runs in this session.
    pub explored: u32,
    /// True when the most recently completed run found zero new layouts,
    /// meaning the reachable search space is likely exhausted.
    pub stalled: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Pose {
    x: i32,
    y: i32,
    /// Rotation as a number of 90-degree CW steps (0..4).
    rot: u8,
}

pub struct OptimizerSession {
    grid_w: i32,
    grid_h: i32,
    /// Item ids and type indices, parallel to `cur`/`best`.
    ids: Vec<String>,
    item_type: Vec<usize>,
    type_ids: Vec<String>,
    /// Shape cells per type per rotation step, normalized to origin.
    rotations: Vec<[Vec<Cell>; 4]>,
    /// For each (type, rot), the lowest rotation index that produces the same
    /// normalized cell shape. Used in `layout_fp` so that rotationally-
    /// equivalent poses hash identically (e.g. all 4 rotations of a 1x1 item).
    canonical_rot: Vec<[u8; 4]>,
    /// Symmetric pair score: tag_synergy(a, b) + tag_synergy(b, a).
    syn2: Vec<Vec<i32>>,
    /// Cell -> placement index, plus a parallel disabled mask.
    occ: Vec<Option<u16>>,
    disabled: Vec<bool>,
    cur: Vec<Pose>,
    cur_score: i32,
    best: Vec<Pose>,
    best_score: i32,
    rng: SmallRng,
    /// Per-run iteration counter; reset by `restart_run` and `reseat`.
    iter: u32,
    total_iters: u32,
    since_improve: u32,
    /// Layouts evaluated across all runs in this session.
    visited: HashSet<u64>,
    /// New layouts found in the current run; used to detect stalls.
    run_visited_count: u32,
}

/// Canonical layout fingerprint: FNV-1a hash of the sorted list of
/// (type_index, canonical_rot, x, y) tuples. Two properties:
/// - Sorting makes same-type position swaps produce the same fingerprint.
/// - `canonical_rot[ti][rot]` is the lowest rotation index that produces the
///   same normalized cell shape, so rotationally-equivalent poses are treated
///   as the same physical layout (e.g. all 4 rotations of a single-cell item).
fn layout_fp(poses: &[Pose], item_type: &[usize], canonical_rot: &[[u8; 4]]) -> u64 {
    let mut entries: Vec<(u32, i32, i32, u8)> = poses
        .iter()
        .zip(item_type)
        .map(|(p, &ti)| {
            let canon = canonical_rot[ti][p.rot as usize];
            (ti as u32, p.x, p.y, canon)
        })
        .collect();
    entries.sort_unstable();

    const OFFSET: u64 = 14695981039346656037;
    const PRIME: u64 = 1099511628211;
    let mut h = OFFSET;
    for (ti, x, y, rot) in entries {
        for &b in ti
            .to_le_bytes()
            .iter()
            .chain(x.to_le_bytes().iter())
            .chain(y.to_le_bytes().iter())
            .chain(std::slice::from_ref(&rot))
        {
            h ^= b as u64;
            h = h.wrapping_mul(PRIME);
        }
    }
    h
}

impl OptimizerSession {
    pub fn new(layout: &Layout, seed: u32, total_iters: u32) -> Result<Self, String> {
        if layout.grid_w <= 0 || layout.grid_h <= 0 {
            return Err(format!(
                "optimizer: invalid grid size {}x{}",
                layout.grid_w, layout.grid_h
            ));
        }
        let n_types = layout.item_types.len();
        let type_index: std::collections::HashMap<&str, usize> = layout
            .item_types
            .iter()
            .enumerate()
            .map(|(i, t)| (t.id.as_str(), i))
            .collect();

        let rotations: Vec<[Vec<Cell>; 4]> = layout
            .item_types
            .iter()
            .map(|t| {
                [
                    rotate_cells(&t.cells, 0),
                    rotate_cells(&t.cells, 90),
                    rotate_cells(&t.cells, 180),
                    rotate_cells(&t.cells, 270),
                ]
            })
            .collect();

        // For each type, map each rotation to the lowest rotation that produces
        // the same normalized shape (so symmetric items deduplicate correctly).
        let canonical_rot: Vec<[u8; 4]> = rotations
            .iter()
            .map(|shapes| {
                let mut canon = [0u8; 4];
                for r in 0..4u8 {
                    canon[r as usize] = (0..r)
                        .find(|&c| shapes[c as usize] == shapes[r as usize])
                        .unwrap_or(r);
                }
                canon
            })
            .collect();

        let syn2: Vec<Vec<i32>> = (0..n_types)
            .map(|a| {
                (0..n_types)
                    .map(|b| {
                        tag_synergy(&layout.item_types[a], &layout.item_types[b])
                            + tag_synergy(&layout.item_types[b], &layout.item_types[a])
                    })
                    .collect()
            })
            .collect();

        let mut ids = Vec::with_capacity(layout.placements.len());
        let mut type_ids = Vec::with_capacity(layout.placements.len());
        let mut item_type = Vec::with_capacity(layout.placements.len());
        let mut cur = Vec::with_capacity(layout.placements.len());
        for p in &layout.placements {
            let ti = *type_index.get(p.type_id.as_str()).ok_or_else(|| {
                format!(
                    "optimizer: unknown item type \"{}\" for placement \"{}\"",
                    p.type_id, p.id
                )
            })?;
            ids.push(p.id.clone());
            type_ids.push(p.type_id.clone());
            item_type.push(ti);
            cur.push(Pose {
                x: p.x,
                y: p.y,
                rot: (p.rot.rem_euclid(360) / 90) as u8,
            });
        }
        if cur.len() > u16::MAX as usize {
            return Err(format!(
                "optimizer: too many placements ({}); the occupancy grid indexes with u16",
                cur.len()
            ));
        }

        let size = (layout.grid_w * layout.grid_h) as usize;
        let mut disabled = vec![false; size];
        for key in &layout.disabled_cells {
            let (x, y) = key
                .split_once(',')
                .and_then(|(a, b)| Some((a.parse::<i32>().ok()?, b.parse::<i32>().ok()?)))
                .ok_or_else(|| format!("optimizer: malformed disabled cell key \"{key}\""))?;
            if x >= 0 && y >= 0 && x < layout.grid_w && y < layout.grid_h {
                disabled[(y * layout.grid_w + x) as usize] = true;
            }
        }

        let mut session = OptimizerSession {
            grid_w: layout.grid_w,
            grid_h: layout.grid_h,
            ids,
            item_type,
            type_ids,
            rotations,
            canonical_rot,
            syn2,
            occ: vec![None; size],
            disabled,
            cur: cur.clone(),
            cur_score: calc_score(layout).total,
            best: cur,
            best_score: 0,
            rng: SmallRng::seed_from_u64(seed as u64),
            iter: 0,
            total_iters,
            since_improve: 0,
            visited: HashSet::new(),
            run_visited_count: 0,
        };
        session.best_score = session.cur_score;

        for i in 0..session.cur.len() {
            let pose = session.cur[i];
            if !session.fits_at(i, &pose) {
                return Err(format!(
                    "optimizer: initial placement \"{}\" is out of bounds or overlaps",
                    session.ids[i]
                ));
            }
            session.insert(i, &pose);
        }

        // Record the initial layout as the first explored state.
        let fp = layout_fp(&session.cur, &session.item_type, &session.canonical_rot);
        session.visited.insert(fp);

        Ok(session)
    }

    /// Run up to `n` more iterations; returns the best layout found so far.
    pub fn step(&mut self, n: u32) -> Progress {
        if self.cur.is_empty() {
            self.iter = self.total_iters;
        }
        let stagnation_limit = (self.total_iters / 8).max(1);
        for _ in 0..n {
            if self.iter >= self.total_iters {
                break;
            }
            self.iter += 1;
            let t = self.temperature();
            let improved_before = self.best_score;
            self.try_random_move(t);
            if self.best_score > improved_before {
                self.since_improve = 0;
            } else {
                self.since_improve += 1;
                // Restart from the best layout and kick into a fresh basin.
                if self.since_improve >= stagnation_limit {
                    self.reset_to_best();
                    self.kick(self.cur.len() as u32);
                    self.since_improve = 0;
                }
            }
        }
        let done = self.iter >= self.total_iters;
        Progress {
            placements: self.poses_to_placements(&self.best),
            score: self.best_score,
            done,
            iters_done: self.iter,
            explored: self.visited.len().min(u32::MAX as usize) as u32,
            stalled: done && self.run_visited_count == 0,
        }
    }

    /// Reset per-run counters so the next `step` loop re-anneals T_START->T_END
    /// while the visited set (and the best layout) carry over from prior runs.
    pub fn restart_run(&mut self) {
        self.iter = 0;
        self.run_visited_count = 0;
        self.since_improve = 0;
        // Start each run from the best known state for maximum exploration value.
        self.reset_to_best();
    }

    /// Update the current layout from an external source (e.g. a manual move in
    /// the UI), keeping the visited set intact. The new layout must have the same
    /// set of placement ids; returns an error otherwise.
    pub fn reseat(&mut self, layout: &Layout) -> Result<(), String> {
        let by_id: std::collections::HashMap<&str, &Placement> = layout
            .placements
            .iter()
            .map(|p| (p.id.as_str(), p))
            .collect();

        // Rebuild cur in the original id order so item_type indices stay aligned.
        let mut new_cur: Vec<Pose> = Vec::with_capacity(self.ids.len());
        for id in &self.ids {
            let p = by_id
                .get(id.as_str())
                .ok_or_else(|| format!("reseat: placement \"{id}\" missing from new layout"))?;
            new_cur.push(Pose {
                x: p.x,
                y: p.y,
                rot: (p.rot.rem_euclid(360) / 90) as u8,
            });
        }

        // Rebuild occupancy from scratch.
        self.occ.fill(None);
        for (i, &pose) in new_cur.iter().enumerate() {
            if !self.fits_at(i, &pose) {
                return Err(format!(
                    "reseat: placement \"{}\" is out of bounds or overlaps",
                    self.ids[i]
                ));
            }
            self.insert(i, &pose);
        }

        self.cur = new_cur;
        self.cur_score = calc_score(layout).total;
        if self.cur_score > self.best_score {
            self.best_score = self.cur_score;
            self.best.copy_from_slice(&self.cur);
        }

        // Record the new position in the visited set.
        let fp = layout_fp(&self.cur, &self.item_type, &self.canonical_rot);
        if self.visited.len() < MAX_VISITED {
            self.visited.insert(fp);
        }

        // Reset per-run counters so the next run starts fresh from this position.
        self.iter = 0;
        self.run_visited_count = 0;
        self.since_improve = 0;

        Ok(())
    }

    /// Best score reached by accepting every legal random relocation (the
    /// spirit of the prototype's shuffle-and-jitter optimizer). Used as a
    /// quality baseline in tests.
    pub fn random_baseline(layout: &Layout, seed: u32, iters: u32) -> Result<i32, String> {
        let mut s = Self::new(layout, seed, iters)?;
        if s.cur.is_empty() {
            return Ok(s.best_score);
        }
        for _ in 0..iters {
            let i = s.rng.random_range(0..s.cur.len());
            let pose = Pose {
                x: s.rng.random_range(0..s.grid_w),
                y: s.rng.random_range(0..s.grid_h),
                rot: s.rng.random_range(0..4u8),
            };
            // Accept unconditionally: an infinite temperature never rejects.
            s.try_single(i, pose, f64::INFINITY);
        }
        Ok(s.best_score)
    }

    fn temperature(&self) -> f64 {
        let frac = self.iter as f64 / self.total_iters.max(1) as f64;
        T_START * (T_END / T_START).powf(frac)
    }

    fn try_random_move(&mut self, t: f64) {
        let n = self.cur.len();
        if n == 0 {
            return;
        }
        let i = self.rng.random_range(0..n);
        match self.rng.random_range(0..100u32) {
            // Local translate: small jitter around the current spot.
            0..=44 => {
                let dx = self.rng.random_range(-2..=2);
                let dy = self.rng.random_range(-2..=2);
                if dx == 0 && dy == 0 {
                    return;
                }
                let p = self.cur[i];
                self.try_single(
                    i,
                    Pose {
                        x: p.x + dx,
                        y: p.y + dy,
                        rot: p.rot,
                    },
                    t,
                );
            }
            // Relocate anywhere.
            45..=69 => {
                let pose = Pose {
                    x: self.rng.random_range(0..self.grid_w),
                    y: self.rng.random_range(0..self.grid_h),
                    rot: self.rng.random_range(0..4u8),
                };
                self.try_single(i, pose, t);
            }
            // Rotate in place.
            70..=84 => {
                let p = self.cur[i];
                let rot = (p.rot + self.rng.random_range(1..4u8)) % 4;
                self.try_single(i, Pose { rot, ..p }, t);
            }
            // Swap two items' positions (each keeps its own rotation).
            _ => {
                if n < 2 {
                    return;
                }
                let j = (i + self.rng.random_range(1..n)) % n;
                self.try_swap(i, j, t);
            }
        }
    }

    fn try_single(&mut self, i: usize, new_pose: Pose, t: f64) -> bool {
        let old_pose = self.cur[i];
        self.remove(i, &old_pose);
        if !self.fits_at(i, &new_pose) {
            self.insert(i, &old_pose);
            return false;
        }

        // Count the proposed layout if it has not been seen before.
        // Revisiting a known layout is allowed; only Metropolis decides acceptance.
        self.cur[i] = new_pose;
        let fp = layout_fp(&self.cur, &self.item_type, &self.canonical_rot);
        self.cur[i] = old_pose;
        if !self.visited.contains(&fp) && self.visited.len() < MAX_VISITED {
            self.visited.insert(fp);
            self.run_visited_count += 1;
        }

        let before = self.edges_of(i, &old_pose);
        let after = self.edges_of(i, &new_pose);
        let delta = after - before;
        if self.accept(delta, t) {
            self.insert(i, &new_pose);
            self.cur[i] = new_pose;
            self.commit_delta(delta);
            true
        } else {
            self.insert(i, &old_pose);
            false
        }
    }

    fn try_swap(&mut self, a: usize, b: usize, t: f64) -> bool {
        let pa = self.cur[a];
        let pb = self.cur[b];
        // Removal order matters for not double-counting the a-b edge: `a` is
        // evaluated with `b` still on the grid, `b` without `a` (and the new
        // poses mirror that), so the pair edge appears exactly once per side.
        self.remove(a, &pa);
        let before_a = self.edges_of(a, &pa);
        self.remove(b, &pb);
        let before_b = self.edges_of(b, &pb);

        let na = Pose {
            x: pb.x,
            y: pb.y,
            rot: pa.rot,
        };
        let nb = Pose {
            x: pa.x,
            y: pa.y,
            rot: pb.rot,
        };
        if !self.fits_at(a, &na) {
            self.insert(b, &pb);
            self.insert(a, &pa);
            return false;
        }
        self.insert(a, &na);
        if !self.fits_at(b, &nb) {
            self.remove(a, &na);
            self.insert(b, &pb);
            self.insert(a, &pa);
            return false;
        }
        let after_b = self.edges_of(b, &nb);
        self.remove(a, &na);
        let after_a = self.edges_of(a, &na);

        // Count the proposed swap layout if it has not been seen before.
        // Revisiting a known layout is allowed; only Metropolis decides acceptance.
        // Both a and b are temporarily out of occ here, so we only need to
        // update cur[] to reflect the proposed state for the hash.
        self.cur[a] = na;
        self.cur[b] = nb;
        let fp = layout_fp(&self.cur, &self.item_type, &self.canonical_rot);
        self.cur[a] = pa;
        self.cur[b] = pb;
        if !self.visited.contains(&fp) && self.visited.len() < MAX_VISITED {
            self.visited.insert(fp);
            self.run_visited_count += 1;
        }

        let delta = after_a + after_b - before_a - before_b;
        if self.accept(delta, t) {
            self.insert(a, &na);
            self.insert(b, &nb);
            self.cur[a] = na;
            self.cur[b] = nb;
            self.commit_delta(delta);
            true
        } else {
            self.insert(b, &pb);
            self.insert(a, &pa);
            false
        }
    }

    fn accept(&mut self, delta: i32, t: f64) -> bool {
        delta >= 0 || self.rng.random::<f64>() < (delta as f64 / t).exp()
    }

    fn commit_delta(&mut self, delta: i32) {
        self.cur_score += delta;
        if self.cur_score > self.best_score {
            self.best_score = self.cur_score;
            self.best.copy_from_slice(&self.cur);
        }
    }

    fn reset_to_best(&mut self) {
        self.occ.fill(None);
        self.cur.copy_from_slice(&self.best);
        self.cur_score = self.best_score;
        for i in 0..self.cur.len() {
            let pose = self.cur[i];
            self.insert(i, &pose);
        }
    }

    /// Apply `n` unconditional random relocations to escape the current basin.
    /// `best` is unchanged; `cur` wanders freely so the next annealing leg
    /// starts from a fresh region of the search space.
    fn kick(&mut self, n: u32) {
        for _ in 0..n {
            self.try_random_move(f64::INFINITY);
        }
    }

    fn cell_index(&self, x: i32, y: i32) -> usize {
        (y * self.grid_w + x) as usize
    }

    fn shape(&self, i: usize, pose: &Pose) -> &[Cell] {
        &self.rotations[self.item_type[i]][pose.rot as usize]
    }

    fn fits_at(&self, i: usize, pose: &Pose) -> bool {
        self.shape(i, pose).iter().all(|&(dx, dy)| {
            let x = pose.x + dx;
            let y = pose.y + dy;
            x >= 0
                && y >= 0
                && x < self.grid_w
                && y < self.grid_h
                && !self.disabled[self.cell_index(x, y)]
                && self.occ[self.cell_index(x, y)].is_none()
        })
    }

    fn insert(&mut self, i: usize, pose: &Pose) {
        for ci in self.shape_cell_indices(i, pose) {
            self.occ[ci] = Some(i as u16);
        }
    }

    fn remove(&mut self, i: usize, pose: &Pose) {
        for ci in self.shape_cell_indices(i, pose) {
            self.occ[ci] = None;
        }
    }

    fn shape_cell_indices(&self, i: usize, pose: &Pose) -> Vec<usize> {
        self.shape(i, pose)
            .iter()
            .map(|&(dx, dy)| self.cell_index(pose.x + dx, pose.y + dy))
            .collect()
    }

    /// Sum of pair scores between item `i` (hypothetically at `pose`, and not
    /// currently on the grid) and every distinct adjacent item.
    fn edges_of(&self, i: usize, pose: &Pose) -> i32 {
        let mut seen: Vec<u16> = Vec::with_capacity(8);
        let mut sum = 0;
        for &(dx, dy) in self.shape(i, pose) {
            let x = pose.x + dx;
            let y = pose.y + dy;
            for (nx, ny) in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)] {
                if nx < 0 || ny < 0 || nx >= self.grid_w || ny >= self.grid_h {
                    continue;
                }
                if let Some(j) = self.occ[self.cell_index(nx, ny)] {
                    if !seen.contains(&j) {
                        seen.push(j);
                        sum += self.syn2[self.item_type[i]][self.item_type[j as usize]];
                    }
                }
            }
        }
        sum
    }

    fn poses_to_placements(&self, poses: &[Pose]) -> Vec<Placement> {
        poses
            .iter()
            .enumerate()
            .map(|(i, p)| Placement {
                id: self.ids[i].clone(),
                type_id: self.type_ids[i].clone(),
                x: p.x,
                y: p.y,
                rot: p.rot as i32 * 90,
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ItemType, Layout, Placement};

    fn dot_layout(grid_w: i32, grid_h: i32, n: usize) -> Layout {
        let item_types = vec![ItemType {
            id: "dot".to_string(),
            tags: vec![],
            synergies: vec![],
            cells: vec![(0, 0)],
        }];
        let placements = (0..n)
            .map(|i| Placement {
                id: format!("p{i}"),
                type_id: "dot".to_string(),
                x: i as i32 % grid_w,
                y: i as i32 / grid_w,
                rot: 0,
            })
            .collect();
        Layout {
            item_types,
            grid_w,
            grid_h,
            disabled_cells: vec![],
            placements,
        }
    }

    /// Identity canonical_rot: each rotation maps to itself (all 4 are distinct).
    const DISTINCT_ROT: [[u8; 4]; 2] = [[0, 1, 2, 3], [0, 1, 2, 3]];
    /// Symmetric canonical_rot: single-cell type where all rotations are identical.
    const SYMMETRIC_ROT: [[u8; 4]; 1] = [[0, 0, 0, 0]];

    #[test]
    fn layout_fp_is_canonical_for_same_type_swap() {
        // Two identical-type items swapping positions produce the same fingerprint.
        let p1 = Pose { x: 0, y: 0, rot: 0 };
        let p2 = Pose { x: 1, y: 0, rot: 0 };
        let types = vec![0usize, 0usize];

        let fp_before = layout_fp(&[p1, p2], &types, &DISTINCT_ROT);
        let fp_after = layout_fp(&[p2, p1], &types, &DISTINCT_ROT);
        assert_eq!(
            fp_before, fp_after,
            "same-type swap must produce the same fingerprint"
        );
    }

    #[test]
    fn layout_fp_collapses_symmetric_rotations() {
        // For a single-cell item (all rotations identical) all 4 rot values
        // must hash to the same fingerprint.
        let pos = Pose { x: 0, y: 0, rot: 0 };
        let types = vec![0usize];
        let base = layout_fp(&[pos], &types, &SYMMETRIC_ROT);
        for r in 1..4u8 {
            let rotated = Pose { rot: r, ..pos };
            assert_eq!(
                layout_fp(&[rotated], &types, &SYMMETRIC_ROT),
                base,
                "rot={r} must hash the same as rot=0 for a symmetric type"
            );
        }
    }

    #[test]
    fn layout_fp_differs_for_different_types() {
        let p1 = Pose { x: 0, y: 0, rot: 0 };
        let p2 = Pose { x: 1, y: 0, rot: 0 };
        // Different type assignment.
        let fp_a = layout_fp(&[p1, p2], &[0, 1], &DISTINCT_ROT);
        let fp_b = layout_fp(&[p1, p2], &[1, 0], &DISTINCT_ROT);
        assert_ne!(
            fp_a, fp_b,
            "swapping types must produce different fingerprints"
        );
    }

    #[test]
    fn layout_fp_differs_for_different_positions() {
        let pa = Pose { x: 0, y: 0, rot: 0 };
        let pb = Pose { x: 2, y: 0, rot: 0 };
        let types = vec![0usize];
        assert_ne!(
            layout_fp(&[pa], &types, &SYMMETRIC_ROT),
            layout_fp(&[pb], &types, &SYMMETRIC_ROT)
        );
    }

    #[test]
    fn visited_grows_and_is_reported_via_explored() {
        let layout = dot_layout(3, 3, 2);
        let mut session = OptimizerSession::new(&layout, 1, 5_000).expect("session");
        let p0 = session.step(0);
        let initial_explored = p0.explored;
        assert!(initial_explored >= 1, "initial layout must be recorded");

        let p1 = session.step(500);
        assert!(
            p1.explored >= initial_explored,
            "explored must not decrease: {} -> {}",
            initial_explored,
            p1.explored
        );
    }

    #[test]
    fn single_layout_space_stalls() {
        // 1x1 grid with 1 single-cell item: only one valid layout.
        let layout = dot_layout(1, 1, 1);
        let mut session = OptimizerSession::new(&layout, 0, 200).expect("session");
        let progress = loop {
            let p = session.step(50);
            if p.done {
                break p;
            }
        };
        assert!(
            progress.stalled,
            "must stall when the only layout was already recorded at construction"
        );
    }

    #[test]
    fn revisit_not_rejected() {
        // Mechanistic: a move that lands on an already-visited layout must NOT be
        // rejected by the visited-set check. Only the Metropolis criterion should
        // decide acceptance.
        //
        // Setup: 1x2 grid, one single-cell item. Only two valid layouts: (0,0) and
        // (0,1). We manually insert the (0,1) fingerprint into visited so it looks
        // "already explored", then call try_single toward (0,1) at infinite
        // temperature (guaranteed Metropolis accept). Old code rejected the move
        // here and returned false; new code must accept it.
        let layout = Layout {
            item_types: vec![ItemType {
                id: "d".to_string(),
                tags: vec![],
                synergies: vec![],
                cells: vec![(0, 0)],
            }],
            grid_w: 1,
            grid_h: 2,
            disabled_cells: vec![],
            placements: vec![Placement {
                id: "p0".to_string(),
                type_id: "d".to_string(),
                x: 0,
                y: 0,
                rot: 0,
            }],
        };
        let mut session = OptimizerSession::new(&layout, 0, 200).expect("session");
        // Pre-populate visited with the target layout's fingerprint.
        let fp_target = layout_fp(
            &[Pose { x: 0, y: 1, rot: 0 }],
            &session.item_type,
            &session.canonical_rot,
        );
        session.visited.insert(fp_target);

        // At infinite temperature, acceptance is certain if the move is not rejected
        // by the visited-set check.
        let moved = session.try_single(0, Pose { x: 0, y: 1, rot: 0 }, f64::INFINITY);
        assert!(moved, "move to already-visited layout must not be rejected");
        assert_eq!(
            session.cur[0],
            Pose { x: 0, y: 1, rot: 0 },
            "cur must reflect the accepted move"
        );
    }

    #[test]
    fn does_not_falsely_stall_on_large_space() {
        // 6x6 grid with 8 single-cell items has C(36,8) ~30M distinct layouts --
        // far more than the 50k-iteration budget can exhaust. Stalling here means
        // the walk trapped itself in a small visited region, not genuine exhaustion.
        let layout = dot_layout(6, 6, 8);
        let mut session = OptimizerSession::new(&layout, 42, 50_000).expect("session");
        let progress = loop {
            let p = session.step(5_000);
            if p.done {
                break p;
            }
        };
        assert!(
            !progress.stalled,
            "must not stall on a large space that 50k iterations cannot exhaust"
        );
    }

    #[test]
    fn explored_keeps_growing_across_runs() {
        // After a second Optimize press the visited set must be larger than after
        // the first -- the walk should keep discovering new layouts, not re-trap
        // in the same already-visited basin.
        let layout = dot_layout(6, 6, 8);
        let mut session = OptimizerSession::new(&layout, 7, 50_000).expect("session");
        loop {
            let p = session.step(5_000);
            if p.done {
                break;
            }
        }
        let explored_after_run1 = session.visited.len();

        session.restart_run();
        loop {
            let p = session.step(5_000);
            if p.done {
                break;
            }
        }
        let explored_after_run2 = session.visited.len();

        assert!(
            explored_after_run2 > explored_after_run1,
            "explored must grow across runs: {} -> {}",
            explored_after_run1,
            explored_after_run2
        );
    }

    #[test]
    fn kick_moves_current_away_from_best() {
        // After a kick, cur should be in a different position from best on a
        // board with room to move (3x3, 3 items = 6 empty cells).
        let layout = dot_layout(4, 4, 3);
        let mut session = OptimizerSession::new(&layout, 13, 5_000).expect("session");
        session.step(100);
        let fp_best = layout_fp(&session.best, &session.item_type, &session.canonical_rot);
        // Reset to best then kick so we start from a known position before perturbing.
        session.reset_to_best();
        session.kick(session.cur.len() as u32 * 4);
        let fp_cur = layout_fp(&session.cur, &session.item_type, &session.canonical_rot);
        assert_ne!(fp_cur, fp_best, "kick must move cur away from best");
    }
}
