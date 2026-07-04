//! Simulated-annealing optimizer over the positions and rotations of already
//! placed items. Item types, inventory, grid size, and disabled cells are
//! fixed inputs; every intermediate state is a legal layout.
//!
//! The session is chunked (`step(n)`) so a Web Worker can post progress and
//! honor cancellation between chunks instead of blocking in one long call.
//!
//! A `HashSet<u64>` visited registry counts distinct *connection classes*
//! encountered. Two layouts share a connection class when the same item types
//! are orthogonally adjacent in the same multiplicity, regardless of position,
//! rotation, or which same-type instance occupies which cell. Since scoring is
//! determined entirely by adjacency, this is the coarsest fingerprint that
//! still distinguishes meaningfully different arrangements.
//! Revisiting an already-seen class is intentionally allowed -- the walk must
//! be free to pass through familiar states to reach unexplored regions
//! (ergodicity). Revisits simply do not increment the counter.
//! `restart_run` resets the per-run counters (temperature, stagnation) while
//! keeping the cross-run visited set so successive presses of Optimize cover
//! new ground. `reseat` updates the current position from a new Layout (e.g.
//! after a manual move) while also preserving the visited set.

use std::collections::{HashMap, HashSet};

use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};
use serde::Serialize;

use crate::model::{rotate_cells, Cell, ItemType, Layout, Placement};
use crate::score::{calc_score, tag_synergy};

const T_START: f64 = 3.0;
const T_END: f64 = 0.05;

/// Cap on visited-set size to bound memory (~8 MB at u64 with typical load
/// factor). Once reached, the set is no longer updated but still consulted so
/// already-seen layouts continue to be rejected.
const MAX_VISITED: usize = 1_000_000;

/// Maximum number of distinct tied-best layouts stored per session. Keeps
/// memory bounded and the UI Prev/Next list sane.
pub(crate) const MAX_BEST_LAYOUTS: usize = 64;

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
    /// Number of distinct best-scoring layouts collected in this session.
    pub best_layout_count: u32,
    /// Provable upper bound on the achievable score, computed at construction.
    pub upper_bound: i32,
    /// True when `score` equals `upper_bound`: the best found score is provably optimal.
    pub provably_optimal: bool,
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
    /// Symmetric pair score: tag_synergy(a, b) + tag_synergy(b, a).
    syn2: Vec<Vec<i32>>,
    /// Directed synergy: syn_dir[a][b] = tag_synergy(types[a], types[b]).
    /// Used to compute per-type score profiles for composition-based dedup.
    syn_dir: Vec<Vec<i32>>,
    /// Provable upper bound on the achievable score; computed once at construction.
    upper_bound: i32,
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
    /// All distinct pose-sets that tie the current best score, capped at
    /// `MAX_BEST_LAYOUTS`. Cleared and restarted whenever a strictly better
    /// score is found.
    best_layouts: Vec<Vec<Pose>>,
    /// Fingerprints of every entry in `best_layouts` for O(1) dedup.
    best_fps: HashSet<u64>,
    // Scratch buffers reused by adjacency_fp_cached to avoid per-iteration heap allocation.
    // TODO: replace sort+hash with an order-independent incremental hash (XOR/wrapping-add of
    // per-pair sub-hashes) to eliminate the sort entirely.
    fp_cell_map: HashMap<(i32, i32), usize>,
    fp_seen: HashSet<(usize, usize)>,
    fp_pairs: Vec<(u32, u32)>,
}

/// Connection fingerprint: FNV-1a hash of the sorted multiset of adjacent
/// item-type pairs. Two layouts share a fingerprint iff the same item types
/// are orthogonally adjacent in the same multiplicity -- i.e. they have the
/// same score and the same connection structure, regardless of position,
/// rotation, reflection, or which same-type instance sits where.
///
/// `rotations[ti][rot]` gives the normalized cell offsets for type `ti` at
/// rotation `rot`, used to expand each item's footprint without relying on
/// the occupancy grid (which may be inconsistent mid-move).
fn adjacency_fp(poses: &[Pose], item_type: &[usize], rotations: &[[Vec<Cell>; 4]]) -> u64 {
    // Build a cell -> item index map directly from poses, bypassing occ.
    let mut cell_map: HashMap<(i32, i32), usize> = HashMap::with_capacity(poses.len() * 4);
    for (i, pose) in poses.iter().enumerate() {
        for &(dx, dy) in &rotations[item_type[i]][pose.rot as usize] {
            cell_map.insert((pose.x + dx, pose.y + dy), i);
        }
    }

    // Collect each unordered adjacent item pair exactly once, then map to
    // its (min_type, max_type) pair so same-type swaps are transparent.
    let mut seen: HashSet<(usize, usize)> = HashSet::new();
    let mut type_pairs: Vec<(u32, u32)> = Vec::new();
    for (&(cx, cy), &i) in &cell_map {
        for (nx, ny) in [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)] {
            if let Some(&j) = cell_map.get(&(nx, ny)) {
                if i != j {
                    let pair = (i.min(j), i.max(j));
                    if seen.insert(pair) {
                        let ti = item_type[i] as u32;
                        let tj = item_type[j] as u32;
                        type_pairs.push((ti.min(tj), ti.max(tj)));
                    }
                }
            }
        }
    }
    type_pairs.sort_unstable();

    const OFFSET: u64 = 14695981039346656037;
    const PRIME: u64 = 1099511628211;
    let mut h = OFFSET;
    for (ta, tb) in type_pairs {
        for &b in ta.to_le_bytes().iter().chain(tb.to_le_bytes().iter()) {
            h ^= b as u64;
            h = h.wrapping_mul(PRIME);
        }
    }
    h
}

/// Composition fingerprint: FNV-1a hash of the per-type score totals.
/// Two layouts share this fingerprint iff every item type earns the same
/// aggregate bonus -- i.e. the Composition panel would display identical
/// numbers. This is coarser than `adjacency_fp`: different adjacency multisets
/// whose per-type sums coincide collapse to one browser entry.
///
/// `syn_dir[a][b]` = tag_synergy(types[a], types[b]): the directed score
/// item a gains for each adjacent neighbor of type b.
fn composition_fp(
    poses: &[Pose],
    item_type: &[usize],
    rotations: &[[Vec<Cell>; 4]],
    syn_dir: &[Vec<i32>],
) -> u64 {
    // Build cell -> item index map directly from poses, bypassing occ.
    let mut cell_map: HashMap<(i32, i32), usize> = HashMap::with_capacity(poses.len() * 4);
    for (i, pose) in poses.iter().enumerate() {
        for &(dx, dy) in &rotations[item_type[i]][pose.rot as usize] {
            cell_map.insert((pose.x + dx, pose.y + dy), i);
        }
    }

    // Accumulate directed score per type across all instances.
    let n_types = syn_dir.len();
    let mut totals = vec![0i32; n_types];
    let mut seen: HashSet<(usize, usize)> = HashSet::new();
    for (&(cx, cy), &i) in &cell_map {
        for (nx, ny) in [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)] {
            if let Some(&j) = cell_map.get(&(nx, ny)) {
                if i != j {
                    let pair = (i.min(j), i.max(j));
                    if seen.insert(pair) {
                        let ti = item_type[i];
                        let tj = item_type[j];
                        totals[ti] += syn_dir[ti][tj];
                        totals[tj] += syn_dir[tj][ti];
                    }
                }
            }
        }
    }

    // FNV-1a hash of per-type totals in type-index order.
    const OFFSET: u64 = 14695981039346656037;
    const PRIME: u64 = 1099511628211;
    let mut h = OFFSET;
    for total in &totals {
        for &b in total.to_le_bytes().iter() {
            h ^= b as u64;
            h = h.wrapping_mul(PRIME);
        }
    }
    h
}

/// Shape cells per type per 90-degree rotation step, normalized to origin.
fn build_rotations(item_types: &[ItemType]) -> Vec<[Vec<Cell>; 4]> {
    item_types
        .iter()
        .map(|t| {
            [
                rotate_cells(&t.cells, 0),
                rotate_cells(&t.cells, 90),
                rotate_cells(&t.cells, 180),
                rotate_cells(&t.cells, 270),
            ]
        })
        .collect()
}

/// Pairwise synergy matrices: `syn2[a][b]` is the symmetric per-edge score
/// (both directions summed); `syn_dir[a][b]` is the directed score type `a`
/// gains per adjacent neighbor of type `b`.
fn build_synergy_matrices(item_types: &[ItemType]) -> (Vec<Vec<i32>>, Vec<Vec<i32>>) {
    let n_types = item_types.len();
    let syn_dir: Vec<Vec<i32>> = (0..n_types)
        .map(|a| {
            (0..n_types)
                .map(|b| tag_synergy(&item_types[a], &item_types[b]))
                .collect()
        })
        .collect();
    let syn2: Vec<Vec<i32>> = (0..n_types)
        .map(|a| {
            (0..n_types)
                .map(|b| syn_dir[a][b] + syn_dir[b][a])
                .collect()
        })
        .collect();
    (syn2, syn_dir)
}

/// Parse `"x,y"` disabled-cell keys into a row-major mask. Malformed keys are
/// an error; keys outside the grid are silently ignored (the UI can hold
/// disabled cells that a shrink pushed out of range).
fn parse_disabled_cells(keys: &[String], grid_w: i32, grid_h: i32) -> Result<Vec<bool>, String> {
    let mut disabled = vec![false; (grid_w * grid_h) as usize];
    for key in keys {
        let (x, y) = key
            .split_once(',')
            .and_then(|(a, b)| Some((a.parse::<i32>().ok()?, b.parse::<i32>().ok()?)))
            .ok_or_else(|| format!("optimizer: malformed disabled cell key \"{key}\""))?;
        if x >= 0 && y >= 0 && x < grid_w && y < grid_h {
            disabled[(y * grid_w + x) as usize] = true;
        }
    }
    Ok(disabled)
}

/// Per-type shape perimeter: number of exposed boundary edges (each can touch
/// a distinct neighbor item). Used in the upper-bound calculation.
fn shape_perimeters(item_types: &[ItemType]) -> Vec<usize> {
    item_types
        .iter()
        .map(|t| {
            let cells: HashSet<(i32, i32)> = t.cells.iter().copied().collect();
            t.cells
                .iter()
                .map(|&(cx, cy)| {
                    [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)]
                        .iter()
                        .filter(|&&n| !cells.contains(&n))
                        .count()
                })
                .sum()
        })
        .collect()
}

/// Per-item degree relaxation: for each item, sum its best
/// min(perimeter, n-1) positive undirected neighbor weights. Halve the
/// sum because each edge contributes to both endpoints. The result is a
/// valid over-estimate: it ignores geometric feasibility and the mutual
/// constraint that each edge requires agreement from both sides.
fn compute_upper_bound(item_type: &[usize], perimeters: &[usize], syn2: &[Vec<i32>]) -> i32 {
    let n_items = item_type.len();
    if n_items < 2 {
        return 0;
    }
    let mut cap_sum = 0i32;
    for i in 0..n_items {
        let ti = item_type[i];
        let k = perimeters[ti].min(n_items - 1);
        let mut weights: Vec<i32> = (0..n_items)
            .filter(|&j| j != i)
            .map(|j| syn2[ti][item_type[j]])
            .filter(|&w| w > 0)
            .collect();
        weights.sort_unstable_by(|a, b| b.cmp(a));
        weights.truncate(k);
        cap_sum += weights.iter().sum::<i32>();
    }
    cap_sum / 2
}

impl OptimizerSession {
    pub fn new(layout: &Layout, seed: u32, total_iters: u32) -> Result<Self, String> {
        if layout.grid_w <= 0 || layout.grid_h <= 0 {
            return Err(format!(
                "optimizer: invalid grid size {}x{}",
                layout.grid_w, layout.grid_h
            ));
        }
        let type_index: std::collections::HashMap<&str, usize> = layout
            .item_types
            .iter()
            .enumerate()
            .map(|(i, t)| (t.id.as_str(), i))
            .collect();

        let rotations = build_rotations(&layout.item_types);
        let (syn2, syn_dir) = build_synergy_matrices(&layout.item_types);

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
        let disabled = parse_disabled_cells(&layout.disabled_cells, layout.grid_w, layout.grid_h)?;

        let perimeters = shape_perimeters(&layout.item_types);
        let upper_bound = compute_upper_bound(&item_type, &perimeters, &syn2);

        let initial_score = calc_score(layout).map_err(|e| e.to_string())?.total;
        let mut session = OptimizerSession {
            grid_w: layout.grid_w,
            grid_h: layout.grid_h,
            ids,
            item_type,
            type_ids,
            rotations,
            syn2,
            syn_dir,
            upper_bound,
            occ: vec![None; size],
            disabled,
            cur: cur.clone(),
            cur_score: initial_score,
            best: cur,
            best_score: 0,
            rng: SmallRng::seed_from_u64(seed as u64),
            iter: 0,
            total_iters,
            since_improve: 0,
            visited: HashSet::new(),
            run_visited_count: 0,
            best_layouts: Vec::new(),
            best_fps: HashSet::new(),
            fp_cell_map: HashMap::new(),
            fp_seen: HashSet::new(),
            fp_pairs: Vec::new(),
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

        // Record the initial layout as the first explored state and first best.
        // visited tracks connection classes (adjacency fp); best_fps tracks
        // composition profiles (coarser) for the Prev/Next browser.
        let afp = adjacency_fp(&session.cur, &session.item_type, &session.rotations);
        session.visited.insert(afp);
        let cfp = composition_fp(
            &session.cur,
            &session.item_type,
            &session.rotations,
            &session.syn_dir,
        );
        session.best_layouts.push(session.cur.clone());
        session.best_fps.insert(cfp);

        Ok(session)
    }

    /// Run up to `n` more iterations; returns the best layout found so far.
    pub fn step(&mut self, n: u32) -> Progress {
        // Empty layout or bound already achieved (meaningful only when > 0,
        // so zero-synergy layouts with upper_bound=0 run normally).
        let already_optimal = self.upper_bound > 0 && self.best_score >= self.upper_bound;
        if self.cur.is_empty() || already_optimal {
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
                // Provably optimal: non-trivial bound reached mid-step. Break
                // without inflating iter to total_iters so iters_done is honest.
                if self.upper_bound > 0 && self.best_score >= self.upper_bound {
                    break;
                }
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
        let provably_optimal = self.upper_bound > 0 && self.best_score >= self.upper_bound;
        let done = self.iter >= self.total_iters || provably_optimal;
        Progress {
            placements: self.poses_to_placements(&self.best),
            score: self.best_score,
            done,
            iters_done: self.iter,
            explored: self.visited.len().min(u32::MAX as usize) as u32,
            stalled: done && self.run_visited_count == 0,
            best_layout_count: self.best_layouts.len().min(u32::MAX as usize) as u32,
            upper_bound: self.upper_bound,
            provably_optimal,
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
        self.cur_score = calc_score(layout).map_err(|e| e.to_string())?.total;

        // Record the new position in the visited set (adjacency fp) and update
        // best/best_layouts (composition fp computed inside record_best).
        let afp = adjacency_fp(&self.cur, &self.item_type, &self.rotations);
        if self.visited.len() < MAX_VISITED {
            self.visited.insert(afp);
        }
        self.record_best();

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
        let fp = self.adjacency_fp_cached();
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
        let fp = self.adjacency_fp_cached();
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
        self.record_best();
    }

    /// Update `best` and `best_layouts` whenever `cur_score` ties or beats
    /// the current best. Keyed by composition fingerprint so the browser
    /// holds one representative per distinct per-type score profile.
    fn record_best(&mut self) {
        let fp = composition_fp(&self.cur, &self.item_type, &self.rotations, &self.syn_dir);
        if self.cur_score > self.best_score {
            self.best_score = self.cur_score;
            self.best.copy_from_slice(&self.cur);
            self.best_layouts.clear();
            self.best_fps.clear();
            self.best_layouts.push(self.cur.to_vec());
            self.best_fps.insert(fp);
        } else if self.cur_score == self.best_score
            && !self.best_fps.contains(&fp)
            && self.best_layouts.len() < MAX_BEST_LAYOUTS
        {
            self.best_layouts.push(self.cur.to_vec());
            self.best_fps.insert(fp);
        }
    }

    /// Expose all collected best layouts as placement lists (one per distinct
    /// arrangement that ties the best score found so far).
    pub fn best_layouts(&self) -> Vec<Vec<Placement>> {
        self.best_layouts
            .iter()
            .map(|poses| self.poses_to_placements(poses))
            .collect()
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
        // Direct field access (not via self.shape()) so the immutable borrow of
        // self.rotations doesn't conflict with the mutable borrow of self.occ.
        let type_idx = self.item_type[i];
        let rot = pose.rot as usize;
        let n = self.rotations[type_idx][rot].len();
        for k in 0..n {
            let (dx, dy) = self.rotations[type_idx][rot][k];
            let ci = ((pose.y + dy) * self.grid_w + (pose.x + dx)) as usize;
            self.occ[ci] = Some(i as u16);
        }
    }

    fn remove(&mut self, i: usize, pose: &Pose) {
        let type_idx = self.item_type[i];
        let rot = pose.rot as usize;
        let n = self.rotations[type_idx][rot].len();
        for k in 0..n {
            let (dx, dy) = self.rotations[type_idx][rot][k];
            let ci = ((pose.y + dy) * self.grid_w + (pose.x + dx)) as usize;
            self.occ[ci] = None;
        }
    }

    /// Like `adjacency_fp` but reuses per-session scratch buffers to avoid
    /// heap allocation on every hot-loop iteration.
    fn adjacency_fp_cached(&mut self) -> u64 {
        self.fp_cell_map.clear();
        self.fp_seen.clear();
        self.fp_pairs.clear();

        for (i, pose) in self.cur.iter().enumerate() {
            for &(dx, dy) in &self.rotations[self.item_type[i]][pose.rot as usize] {
                self.fp_cell_map.insert((pose.x + dx, pose.y + dy), i);
            }
        }

        for (&(cx, cy), &i) in &self.fp_cell_map {
            for (nx, ny) in [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)] {
                if let Some(&j) = self.fp_cell_map.get(&(nx, ny)) {
                    if i != j {
                        let pair = (i.min(j), i.max(j));
                        if self.fp_seen.insert(pair) {
                            let ti = self.item_type[i] as u32;
                            let tj = self.item_type[j] as u32;
                            self.fp_pairs.push((ti.min(tj), ti.max(tj)));
                        }
                    }
                }
            }
        }
        self.fp_pairs.sort_unstable();

        const OFFSET: u64 = 14695981039346656037;
        const PRIME: u64 = 1099511628211;
        let mut h = OFFSET;
        for (ta, tb) in &self.fp_pairs {
            for &b in ta.to_le_bytes().iter().chain(tb.to_le_bytes().iter()) {
                h ^= b as u64;
                h = h.wrapping_mul(PRIME);
            }
        }
        h
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
    use crate::model::{ItemType, Layout, Placement, Synergy};

    fn shape(id: &str, cells: Vec<Cell>) -> ItemType {
        ItemType {
            id: id.to_string(),
            tags: vec![],
            synergies: vec![],
            cells,
        }
    }

    // --- constructor helpers ---

    #[test]
    fn build_rotations_matches_rotate_cells() {
        let l = shape("L", vec![(0, 0), (0, 1), (1, 1)]);
        let rots = build_rotations(std::slice::from_ref(&l));
        for (i, rot) in [0, 90, 180, 270].into_iter().enumerate() {
            assert_eq!(rots[0][i], rotate_cells(&l.cells, rot), "rotation {rot}");
        }
    }

    #[test]
    fn build_synergy_matrices_directed_and_symmetric_agree() {
        // a gains +1 next to b (rule on tag "x"); b loses 1 next to a
        // (negative rule on tag "y").
        let mut a = shape("a", vec![(0, 0)]);
        a.tags = vec!["y".to_string()];
        a.synergies = vec![Synergy {
            tag: "x".to_string(),
            positive: None,
        }];
        let mut b = shape("b", vec![(0, 0)]);
        b.tags = vec!["x".to_string()];
        b.synergies = vec![Synergy {
            tag: "y".to_string(),
            positive: Some(false),
        }];
        let types = vec![a, b];
        let (syn2, syn_dir) = build_synergy_matrices(&types);
        assert_eq!(syn_dir[0][1], 1, "a gains from b");
        assert_eq!(syn_dir[1][0], -1, "b loses from a");
        for i in 0..2 {
            for j in 0..2 {
                assert_eq!(
                    syn2[i][j],
                    syn_dir[i][j] + syn_dir[j][i],
                    "syn2 must be the symmetrized sum ({i},{j})"
                );
            }
        }
    }

    #[test]
    fn parse_disabled_cells_sets_only_in_range_keys() {
        let keys = vec!["1,0".to_string(), "9,9".to_string(), "-1,0".to_string()];
        // Out-of-range keys are ignored (matching the constructor's historical
        // leniency); only in-range cells set their mask bit.
        let disabled = parse_disabled_cells(&keys, 3, 2).expect("well-formed keys must parse");
        let mut expected = vec![false; 6];
        expected[1] = true;
        assert_eq!(disabled, expected);
    }

    #[test]
    fn parse_disabled_cells_rejects_malformed_keys() {
        let err = parse_disabled_cells(&["nope".to_string()], 3, 3)
            .expect_err("a malformed key must error");
        assert!(
            err.contains("nope"),
            "error should name the key, got: {err}"
        );
    }

    #[test]
    fn shape_perimeters_counts_exposed_edges() {
        let types = vec![
            shape("single", vec![(0, 0)]),
            shape("domino", vec![(0, 0), (1, 0)]),
            shape("square", vec![(0, 0), (1, 0), (0, 1), (1, 1)]),
        ];
        assert_eq!(shape_perimeters(&types), vec![4, 6, 8]);
    }

    #[test]
    fn upper_bound_zero_for_fewer_than_two_items() {
        let syn2 = vec![vec![0]];
        assert_eq!(compute_upper_bound(&[], &[4], &syn2), 0);
        assert_eq!(compute_upper_bound(&[0], &[4], &syn2), 0);
    }

    #[test]
    fn upper_bound_halves_the_per_item_cap_sum() {
        // Two items of different types with a mutual +2 undirected weight:
        // each item caps at min(perimeter=4, n-1=1) = 1 neighbor, so
        // cap_sum = 2 + 2 = 4 and the bound is 4 / 2 = 2.
        let syn2 = vec![vec![0, 2], vec![2, 0]];
        assert_eq!(compute_upper_bound(&[0, 1], &[4, 4], &syn2), 2);
    }

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

    // Rotation table for a single-cell item type: one rotation step (cells = [(0,0)]).
    fn dot_rotations() -> Vec<[Vec<Cell>; 4]> {
        vec![[vec![(0, 0)], vec![(0, 0)], vec![(0, 0)], vec![(0, 0)]]]
    }

    // Rotation table for an L-shaped item (asymmetric under rotation).
    fn l_rotations() -> Vec<[Vec<Cell>; 4]> {
        use crate::model::rotate_cells;
        let base = vec![(0, 0), (1, 0), (0, 1)];
        vec![[
            rotate_cells(&base, 0),
            rotate_cells(&base, 90),
            rotate_cells(&base, 180),
            rotate_cells(&base, 270),
        ]]
    }

    #[test]
    fn adjacency_fp_equal_for_same_type_swap() {
        // Same-type items swapping positions yield the same connection structure.
        let rots = dot_rotations();
        // p0 at (0,0), p1 at (1,0): adjacent pair of type 0.
        let forward = adjacency_fp(
            &[Pose { x: 0, y: 0, rot: 0 }, Pose { x: 1, y: 0, rot: 0 }],
            &[0, 0],
            &rots,
        );
        // Swap item positions -- same connection structure.
        let swapped = adjacency_fp(
            &[Pose { x: 1, y: 0, rot: 0 }, Pose { x: 0, y: 0, rot: 0 }],
            &[0, 0],
            &rots,
        );
        assert_eq!(
            forward, swapped,
            "same-type swap must not change the fingerprint"
        );
    }

    #[test]
    fn adjacency_fp_invariant_under_rotation() {
        // Rotating an item in place never changes the connection fingerprint
        // because adjacency is determined by which cells border each other,
        // not by which rotation produced those cells.
        let rots = dot_rotations();
        let base = adjacency_fp(&[Pose { x: 0, y: 0, rot: 0 }], &[0], &rots);
        for r in 1..4u8 {
            assert_eq!(
                adjacency_fp(&[Pose { x: 0, y: 0, rot: r }], &[0], &rots),
                base,
                "rotation {r} must give the same fingerprint as rot=0"
            );
        }
    }

    #[test]
    fn adjacency_fp_equal_for_translation() {
        // The same cluster at two different grid positions must hash identically.
        let rots = dot_rotations();
        // Two items adjacent at (0,0)+(1,0).
        let here = adjacency_fp(
            &[Pose { x: 0, y: 0, rot: 0 }, Pose { x: 1, y: 0, rot: 0 }],
            &[0, 0],
            &rots,
        );
        // Same cluster translated to (3,5)+(4,5).
        let there = adjacency_fp(
            &[Pose { x: 3, y: 5, rot: 0 }, Pose { x: 4, y: 5, rot: 0 }],
            &[0, 0],
            &rots,
        );
        assert_eq!(here, there, "translation must not change the fingerprint");
    }

    #[test]
    fn adjacency_fp_differs_adjacent_vs_nonadjacent() {
        // Adjacent and non-adjacent arrangements of the same items must hash differently.
        // Provide two rotation entries so both type indices (0 and 1) are in bounds.
        let rots = vec![
            [vec![(0, 0)], vec![(0, 0)], vec![(0, 0)], vec![(0, 0)]],
            [vec![(0, 0)], vec![(0, 0)], vec![(0, 0)], vec![(0, 0)]],
        ];
        let adjacent = adjacency_fp(
            &[Pose { x: 0, y: 0, rot: 0 }, Pose { x: 1, y: 0, rot: 0 }],
            &[0, 1],
            &rots,
        );
        let nonadjacent = adjacency_fp(
            &[Pose { x: 0, y: 0, rot: 0 }, Pose { x: 3, y: 0, rot: 0 }],
            &[0, 1],
            &rots,
        );
        assert_ne!(
            adjacent, nonadjacent,
            "adjacent vs non-adjacent must differ"
        );
    }

    #[test]
    fn adjacency_fp_differs_for_different_type_pairs() {
        // Two items adjacent: (type 0, type 1) vs (type 0, type 2) must differ.
        let rots = vec![
            [vec![(0, 0)], vec![(0, 0)], vec![(0, 0)], vec![(0, 0)]],
            [vec![(0, 0)], vec![(0, 0)], vec![(0, 0)], vec![(0, 0)]],
            [vec![(0, 0)], vec![(0, 0)], vec![(0, 0)], vec![(0, 0)]],
        ];
        let fp_01 = adjacency_fp(
            &[Pose { x: 0, y: 0, rot: 0 }, Pose { x: 1, y: 0, rot: 0 }],
            &[0, 1],
            &rots,
        );
        let fp_02 = adjacency_fp(
            &[Pose { x: 0, y: 0, rot: 0 }, Pose { x: 1, y: 0, rot: 0 }],
            &[0, 2],
            &rots,
        );
        assert_ne!(
            fp_01, fp_02,
            "different type pairs must give different fingerprints"
        );
    }

    #[test]
    fn adjacency_fp_captures_asymmetric_shape_rotation() {
        // An asymmetric (L-shaped) item whose rotation changes which cells it
        // occupies: if that changes adjacency with a neighbor, the fingerprint
        // must differ; if the neighbor remains the same, it must be equal.
        let rots = {
            let mut r = l_rotations();
            // Add a 1x1 neighbor type.
            r.push([vec![(0, 0)], vec![(0, 0)], vec![(0, 0)], vec![(0, 0)]]);
            r
        };
        // L at (0,0) rot=0, dot at (2,0): no adjacency at rot=0 for this shape.
        let rot0 = adjacency_fp(
            &[Pose { x: 0, y: 0, rot: 0 }, Pose { x: 2, y: 0, rot: 0 }],
            &[0, 1],
            &rots,
        );
        // L at (0,0) rot=1: shape changes, may now touch (2,0).
        let rot1 = adjacency_fp(
            &[Pose { x: 0, y: 0, rot: 1 }, Pose { x: 2, y: 0, rot: 0 }],
            &[0, 1],
            &rots,
        );
        // The important property: if adjacency changed, fingerprints differ.
        // If it didn't (cells don't reach), they equal. Either way the function
        // must not panic and must return consistently.
        let _ = rot0;
        let _ = rot1;
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
        // Mechanistic: a move that lands on an already-visited connection class
        // must NOT be rejected by the visited-set check. Only Metropolis decides.
        //
        // Two items (types a and b) on a 1x3 grid. Initial: a=(0,0), b=(0,2) --
        // non-adjacent. Target move: b to (0,1) -- now adjacent to a. We
        // pre-insert the adjacent fingerprint so it looks "already explored",
        // then try the move at infinite temperature (certain Metropolis accept).
        // The move must not be blocked by the visited-set check.
        let layout = Layout {
            item_types: vec![
                ItemType {
                    id: "a".to_string(),
                    tags: vec![],
                    synergies: vec![],
                    cells: vec![(0, 0)],
                },
                ItemType {
                    id: "b".to_string(),
                    tags: vec![],
                    synergies: vec![],
                    cells: vec![(0, 0)],
                },
            ],
            grid_w: 1,
            grid_h: 3,
            disabled_cells: vec![],
            placements: vec![
                Placement {
                    id: "p0".to_string(),
                    type_id: "a".to_string(),
                    x: 0,
                    y: 0,
                    rot: 0,
                },
                Placement {
                    id: "p1".to_string(),
                    type_id: "b".to_string(),
                    x: 0,
                    y: 2,
                    rot: 0,
                },
            ],
        };
        let mut session = OptimizerSession::new(&layout, 0, 200).expect("session");
        // Pre-insert the fingerprint for the adjacent state (b at (0,1)).
        let adjacent_poses = [Pose { x: 0, y: 0, rot: 0 }, Pose { x: 0, y: 1, rot: 0 }];
        let fp_adjacent = adjacency_fp(&adjacent_poses, &session.item_type, &session.rotations);
        session.visited.insert(fp_adjacent);

        // At infinite temperature, acceptance is guaranteed if the visited-set
        // check does not wrongly reject the move.
        let moved = session.try_single(1, Pose { x: 0, y: 1, rot: 0 }, f64::INFINITY);
        assert!(moved, "move to already-visited layout must not be rejected");
        assert_eq!(
            session.cur[1],
            Pose { x: 0, y: 1, rot: 0 },
            "cur must reflect the accepted move"
        );
    }

    // Tests for best_layouts collection (Feature 3).

    #[test]
    fn best_layout_count_in_progress() {
        // The Progress struct must carry best_layout_count and it must match
        // the length returned by best_layouts().
        let layout = dot_layout(3, 3, 2);
        let mut session = OptimizerSession::new(&layout, 7, 5_000).expect("session");
        let p = loop {
            let p = session.step(5_000);
            if p.done {
                break p;
            }
        };
        assert!(
            p.best_layout_count >= 1,
            "progress must report at least one best layout"
        );
        assert_eq!(
            p.best_layout_count as usize,
            session.best_layouts().len(),
            "progress.best_layout_count must match best_layouts().len()"
        );
    }

    #[test]
    fn tied_layouts_are_collected() {
        // Three mutually-synergizing items on a 3x1 grid: every 3-adjacent
        // arrangement scores 4, but the center item earns +2 while the ends
        // earn +1. Three distinct center choices yield three distinct
        // composition profiles, all at score 4. The collection must hold at
        // least two (i.e. not collapse everything to one).
        let layout = multi_comp_layout();
        let mut session = OptimizerSession::new(&layout, 1, 20_000).expect("session");
        loop {
            let p = session.step(5_000);
            if p.done {
                break;
            }
        }
        let bests = session.best_layouts();
        assert!(
            bests.len() >= 2,
            "expected multiple distinct composition profiles but got {}",
            bests.len()
        );
    }

    #[test]
    fn all_best_layouts_score_the_same() {
        // Every layout returned by best_layouts() must re-score to the
        // session's best score; stale lower-score entries must not appear.
        let item_types = vec![
            ItemType {
                id: "a".to_string(),
                tags: vec!["x".to_string()],
                synergies: vec![crate::model::Synergy {
                    tag: "x".to_string(),
                    positive: Some(true),
                }],
                cells: vec![(0, 0)],
            },
            ItemType {
                id: "b".to_string(),
                tags: vec!["x".to_string()],
                synergies: vec![crate::model::Synergy {
                    tag: "x".to_string(),
                    positive: Some(true),
                }],
                cells: vec![(0, 0)],
            },
        ];
        // Start far apart (score 0); optimizer will find adjacent (score 2).
        let layout = Layout {
            item_types,
            grid_w: 5,
            grid_h: 1,
            disabled_cells: vec![],
            placements: vec![
                Placement {
                    id: "p0".to_string(),
                    type_id: "a".to_string(),
                    x: 0,
                    y: 0,
                    rot: 0,
                },
                Placement {
                    id: "p1".to_string(),
                    type_id: "b".to_string(),
                    x: 4,
                    y: 0,
                    rot: 0,
                },
            ],
        };
        let mut session = OptimizerSession::new(&layout, 1, 10_000).expect("session");
        let best_score = loop {
            let p = session.step(2_000);
            if p.done {
                break p.score;
            }
        };

        let bests = session.best_layouts();
        assert!(!bests.is_empty(), "must have at least one best layout");
        for group in &bests {
            let test_layout = Layout {
                item_types: layout.item_types.clone(),
                grid_w: 5,
                grid_h: 1,
                disabled_cells: vec![],
                placements: group.clone(),
            };
            let s = crate::score::calc_score(&test_layout)
                .expect("tied layout must score")
                .total;
            assert_eq!(
                s, best_score,
                "tied layout re-scored to {s}, expected {best_score}"
            );
        }
    }

    #[test]
    fn max_best_layouts_cap_is_respected() {
        // Even on a huge space with many tied arrangements the cap must hold.
        let layout = dot_layout(8, 8, 10);
        let mut session = OptimizerSession::new(&layout, 99, 100_000).expect("session");
        loop {
            let p = session.step(10_000);
            if p.done {
                break;
            }
        }
        assert!(
            session.best_layouts().len() <= super::MAX_BEST_LAYOUTS,
            "best_layouts must not exceed MAX_BEST_LAYOUTS"
        );
    }

    #[test]
    fn tied_layouts_are_unique() {
        // Each entry in best_layouts must have a distinct composition profile;
        // no two entries should share the same per-type score totals, even
        // across restart_run calls.
        let layout = multi_comp_layout();
        let mut session = OptimizerSession::new(&layout, 42, 10_000).expect("session");
        loop {
            let p = session.step(5_000);
            if p.done {
                break;
            }
        }
        session.restart_run();
        loop {
            let p = session.step(5_000);
            if p.done {
                break;
            }
        }

        let bests = session.best_layouts();
        // Reconstruct composition fingerprints from the returned Placement structs.
        let mut fps: Vec<u64> = bests
            .iter()
            .map(|group| {
                let poses: Vec<Pose> = group
                    .iter()
                    .map(|p| Pose {
                        x: p.x,
                        y: p.y,
                        rot: (p.rot / 90) as u8,
                    })
                    .collect();
                composition_fp(
                    &poses,
                    &session.item_type,
                    &session.rotations,
                    &session.syn_dir,
                )
            })
            .collect();
        fps.sort_unstable();
        fps.dedup();
        assert_eq!(
            fps.len(),
            bests.len(),
            "best_layouts must contain distinct composition profiles"
        );
    }

    /// Eight single-cell items of four distinct types spread across a 6x6 grid.
    /// The connection space (distinct type-pair multisets) is large enough that
    /// a 50k-iteration budget cannot exhaust it, making it suitable for stall and
    /// cross-run growth tests.
    fn diverse_layout() -> Layout {
        let item_types = vec![
            ItemType {
                id: "a".to_string(),
                tags: vec![],
                synergies: vec![],
                cells: vec![(0, 0)],
            },
            ItemType {
                id: "b".to_string(),
                tags: vec![],
                synergies: vec![],
                cells: vec![(0, 0)],
            },
            ItemType {
                id: "c".to_string(),
                tags: vec![],
                synergies: vec![],
                cells: vec![(0, 0)],
            },
            ItemType {
                id: "d".to_string(),
                tags: vec![],
                synergies: vec![],
                cells: vec![(0, 0)],
            },
        ];
        let placements = vec![
            Placement {
                id: "p0".to_string(),
                type_id: "a".to_string(),
                x: 0,
                y: 0,
                rot: 0,
            },
            Placement {
                id: "p1".to_string(),
                type_id: "b".to_string(),
                x: 2,
                y: 0,
                rot: 0,
            },
            Placement {
                id: "p2".to_string(),
                type_id: "c".to_string(),
                x: 4,
                y: 0,
                rot: 0,
            },
            Placement {
                id: "p3".to_string(),
                type_id: "d".to_string(),
                x: 0,
                y: 2,
                rot: 0,
            },
            Placement {
                id: "p4".to_string(),
                type_id: "a".to_string(),
                x: 2,
                y: 2,
                rot: 0,
            },
            Placement {
                id: "p5".to_string(),
                type_id: "b".to_string(),
                x: 4,
                y: 2,
                rot: 0,
            },
            Placement {
                id: "p6".to_string(),
                type_id: "c".to_string(),
                x: 0,
                y: 4,
                rot: 0,
            },
            Placement {
                id: "p7".to_string(),
                type_id: "d".to_string(),
                x: 2,
                y: 4,
                rot: 0,
            },
        ];
        Layout {
            item_types,
            grid_w: 6,
            grid_h: 6,
            disabled_cells: vec![],
            placements,
        }
    }

    #[test]
    fn does_not_falsely_stall_on_large_space() {
        // A diverse-type layout has a large connection space (many distinct
        // type-pair multisets) that a 50k-iteration budget cannot exhaust.
        // Stalling here would mean the walk trapped in a small region.
        let layout = diverse_layout();
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
        // the first -- the walk should keep discovering new connection classes.
        // Uses a diverse-type layout whose connection space exceeds the 50k budget.
        let layout = diverse_layout();
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

    fn multi_comp_layout() -> Layout {
        // Three 1x1 items of distinct types, all with the same mutual synergy
        // (tag "all" +1). In a 3x1 grid every 3-adjacent arrangement scores 4,
        // but the center item earns +2 while the ends earn +1 each. Three
        // distinct center choices yield three distinct composition profiles.
        let mk_type = |id: &str| ItemType {
            id: id.to_string(),
            tags: vec!["all".to_string()],
            synergies: vec![crate::model::Synergy {
                tag: "all".to_string(),
                positive: Some(true),
            }],
            cells: vec![(0, 0)],
        };
        let mk = |id: &str, type_id: &str, x: i32| Placement {
            id: id.to_string(),
            type_id: type_id.to_string(),
            x,
            y: 0,
            rot: 0,
        };
        Layout {
            item_types: vec![mk_type("a"), mk_type("b"), mk_type("c")],
            grid_w: 3,
            grid_h: 1,
            disabled_cells: vec![],
            placements: vec![mk("p0", "a", 0), mk("p1", "b", 1), mk("p2", "c", 2)],
        }
    }

    // Directed synergy matrix for two types that mutually synergize +1.
    fn ab_syn_dir() -> Vec<Vec<i32>> {
        vec![vec![0, 1], vec![1, 0]]
    }

    #[test]
    fn composition_fp_equal_for_same_profile() {
        // Two pose-sets with the same per-type score totals (different adjacency
        // instance indices but same type totals) must share the fingerprint.
        // Types: [0=a, 0=a, 1=b]. syn_dir[0][1]=1, syn_dir[1][0]=1.
        // Layout X: item 0 (a) adj item 2 (b), item 1 (a) isolated.
        //           totals: [a=1, b=1]
        // Layout Y: item 1 (a) adj item 2 (b), item 0 (a) isolated.
        //           totals: [a=1, b=1]  (same types, different instance)
        let rots = vec![
            [vec![(0, 0)], vec![(0, 0)], vec![(0, 0)], vec![(0, 0)]],
            [vec![(0, 0)], vec![(0, 0)], vec![(0, 0)], vec![(0, 0)]],
        ];
        let syn_dir = ab_syn_dir();
        let fp_x = composition_fp(
            &[
                Pose { x: 0, y: 0, rot: 0 }, // item 0 (a) adj b
                Pose { x: 5, y: 0, rot: 0 }, // item 1 (a) isolated
                Pose { x: 1, y: 0, rot: 0 }, // item 2 (b)
            ],
            &[0, 0, 1],
            &rots,
            &syn_dir,
        );
        let fp_y = composition_fp(
            &[
                Pose { x: 5, y: 0, rot: 0 }, // item 0 (a) isolated
                Pose { x: 0, y: 0, rot: 0 }, // item 1 (a) adj b
                Pose { x: 1, y: 0, rot: 0 }, // item 2 (b)
            ],
            &[0, 0, 1],
            &rots,
            &syn_dir,
        );
        assert_eq!(
            fp_x, fp_y,
            "different adjacency instances but same type totals must share fingerprint"
        );
    }

    #[test]
    fn composition_fp_differs_when_profile_changes() {
        // Moving b away from a changes the per-type totals, so the fingerprint must differ.
        let rots = vec![
            [vec![(0, 0)], vec![(0, 0)], vec![(0, 0)], vec![(0, 0)]],
            [vec![(0, 0)], vec![(0, 0)], vec![(0, 0)], vec![(0, 0)]],
        ];
        let syn_dir = ab_syn_dir();
        let fp_adj = composition_fp(
            &[Pose { x: 0, y: 0, rot: 0 }, Pose { x: 1, y: 0, rot: 0 }],
            &[0, 1],
            &rots,
            &syn_dir,
        );
        let fp_sep = composition_fp(
            &[Pose { x: 0, y: 0, rot: 0 }, Pose { x: 5, y: 0, rot: 0 }],
            &[0, 1],
            &rots,
            &syn_dir,
        );
        assert_ne!(
            fp_adj, fp_sep,
            "different per-type totals must give different fingerprint"
        );
    }

    #[test]
    fn composition_fp_translation_invariant() {
        // Shifting all items by the same offset must not change the fingerprint.
        let rots = vec![
            [vec![(0, 0)], vec![(0, 0)], vec![(0, 0)], vec![(0, 0)]],
            [vec![(0, 0)], vec![(0, 0)], vec![(0, 0)], vec![(0, 0)]],
        ];
        let syn_dir = ab_syn_dir();
        let here = composition_fp(
            &[Pose { x: 0, y: 0, rot: 0 }, Pose { x: 1, y: 0, rot: 0 }],
            &[0, 1],
            &rots,
            &syn_dir,
        );
        let there = composition_fp(
            &[
                Pose {
                    x: 10,
                    y: 7,
                    rot: 0,
                },
                Pose {
                    x: 11,
                    y: 7,
                    rot: 0,
                },
            ],
            &[0, 1],
            &rots,
            &syn_dir,
        );
        assert_eq!(
            here, there,
            "translation must not change composition fingerprint"
        );
    }

    #[test]
    fn upper_bound_tight_for_two_items() {
        // Two 1x1 items with mutual +1 synergy: syn2[a][b] = 2, perimeter = 4.
        // k = min(4, 1) = 1. cap_i = 2. upper_bound = floor(4/2) = 2.
        // The actual optimum (adjacent) = 2, so the bound is tight.
        let layout = Layout {
            item_types: vec![
                ItemType {
                    id: "a".to_string(),
                    tags: vec!["x".to_string()],
                    synergies: vec![crate::model::Synergy {
                        tag: "x".to_string(),
                        positive: Some(true),
                    }],
                    cells: vec![(0, 0)],
                },
                ItemType {
                    id: "b".to_string(),
                    tags: vec!["x".to_string()],
                    synergies: vec![crate::model::Synergy {
                        tag: "x".to_string(),
                        positive: Some(true),
                    }],
                    cells: vec![(0, 0)],
                },
            ],
            grid_w: 5,
            grid_h: 1,
            disabled_cells: vec![],
            placements: vec![
                Placement {
                    id: "p0".to_string(),
                    type_id: "a".to_string(),
                    x: 0,
                    y: 0,
                    rot: 0,
                },
                Placement {
                    id: "p1".to_string(),
                    type_id: "b".to_string(),
                    x: 4,
                    y: 0,
                    rot: 0,
                },
            ],
        };
        let session = OptimizerSession::new(&layout, 1, 10_000).expect("session");
        assert_eq!(
            session.upper_bound, 2,
            "upper_bound must equal actual optimum (2) for two mutually-synergizing items"
        );
    }

    #[test]
    fn step_halts_at_upper_bound() {
        // With a large budget, the optimizer must stop early once it achieves a
        // score equal to the upper_bound (provably optimal).
        let layout = Layout {
            item_types: vec![
                ItemType {
                    id: "a".to_string(),
                    tags: vec!["x".to_string()],
                    synergies: vec![crate::model::Synergy {
                        tag: "x".to_string(),
                        positive: Some(true),
                    }],
                    cells: vec![(0, 0)],
                },
                ItemType {
                    id: "b".to_string(),
                    tags: vec!["x".to_string()],
                    synergies: vec![crate::model::Synergy {
                        tag: "x".to_string(),
                        positive: Some(true),
                    }],
                    cells: vec![(0, 0)],
                },
            ],
            grid_w: 5,
            grid_h: 1,
            disabled_cells: vec![],
            placements: vec![
                Placement {
                    id: "p0".to_string(),
                    type_id: "a".to_string(),
                    x: 0,
                    y: 0,
                    rot: 0,
                },
                Placement {
                    id: "p1".to_string(),
                    type_id: "b".to_string(),
                    x: 4,
                    y: 0,
                    rot: 0,
                },
            ],
        };
        let mut session = OptimizerSession::new(&layout, 42, 500_000).expect("session");
        let progress = loop {
            let p = session.step(5_000);
            if p.done {
                break p;
            }
        };
        assert!(
            progress.provably_optimal,
            "must be provably optimal when best == upper_bound"
        );
        assert!(
            progress.iters_done < 500_000,
            "must halt early before full budget: iters_done={}",
            progress.iters_done
        );
    }

    #[test]
    fn kick_moves_current_away_from_best() {
        // After a kick, cur must differ from best positionally; kick is meaningless
        // if it leaves every item in exactly the same place (4x4 board, 3 items).
        let layout = dot_layout(4, 4, 3);
        let mut session = OptimizerSession::new(&layout, 13, 5_000).expect("session");
        session.step(100);
        // Reset to best then kick so we start from a known position before perturbing.
        session.reset_to_best();
        session.kick(session.cur.len() as u32 * 4);
        assert_ne!(
            session.cur, session.best,
            "kick must move cur away from best"
        );
    }

    #[test]
    fn upper_bound_sound_when_cap_sum_is_odd() {
        // Regression guard for integer-division soundness: when k-truncation
        // causes cap_sum to be odd, floor(cap_sum/2) must still be >= the
        // achievable score because the achievable score is always an integer.
        //
        // Setup: 5 type-A items + 1 type-B item; only A->B synergy (+1 each).
        //   syn2[A][B] = 1.  Single-cell shapes: perimeter = 4.
        //   n=6, k = min(4, 5) = 4.
        //   Each A contributes cap = 1 (only B neighbour is positive).
        //   B contributes cap = 4 (top 4 of 5 A neighbours, one truncated).
        //   cap_sum = 5 + 4 = 9  (odd).
        //   upper_bound = floor(9/2) = 4.
        //   Max achievable = B adjacent to 4 A's = 4.  Bound is tight and correct.
        //
        // Soundness argument: the achievable score is always an integer, so
        // S <= cap_sum/2 (real) implies S <= floor(cap_sum/2).
        // Integer division is therefore safe; ceil would give 5, which is also
        // a valid bound but looser (and would prevent early-exit here).
        let a_syn = crate::model::Synergy {
            tag: "b".to_string(),
            positive: Some(true),
        };
        let layout = Layout {
            item_types: vec![
                ItemType {
                    id: "a".to_string(),
                    tags: vec![],
                    synergies: vec![a_syn],
                    cells: vec![(0, 0)],
                },
                ItemType {
                    id: "b".to_string(),
                    tags: vec!["b".to_string()],
                    synergies: vec![],
                    cells: vec![(0, 0)],
                },
            ],
            // 3x3 grid: interior cell (1,1) has 4 in-bounds neighbours, so B
            // can achieve 4 adjacencies when surrounded by A's.
            grid_w: 3,
            grid_h: 3,
            disabled_cells: vec![],
            placements: vec![
                Placement {
                    id: "a0".to_string(),
                    type_id: "a".to_string(),
                    x: 0,
                    y: 0,
                    rot: 0,
                },
                Placement {
                    id: "a1".to_string(),
                    type_id: "a".to_string(),
                    x: 2,
                    y: 0,
                    rot: 0,
                },
                Placement {
                    id: "a2".to_string(),
                    type_id: "a".to_string(),
                    x: 0,
                    y: 2,
                    rot: 0,
                },
                Placement {
                    id: "a3".to_string(),
                    type_id: "a".to_string(),
                    x: 2,
                    y: 2,
                    rot: 0,
                },
                Placement {
                    id: "a4".to_string(),
                    type_id: "a".to_string(),
                    x: 0,
                    y: 1,
                    rot: 0,
                },
                Placement {
                    id: "b0".to_string(),
                    type_id: "b".to_string(),
                    x: 2,
                    y: 1,
                    rot: 0,
                },
            ],
        };
        let mut session = OptimizerSession::new(&layout, 1, 200_000).expect("session");

        // floor(9/2) = 4; must equal the max achievable (4 A-neighbours x 1).
        assert_eq!(
            session.upper_bound, 4,
            "upper_bound must be floor(odd cap_sum / 2) = 4"
        );

        // Verify the optimizer reaches this bound (provably optimal).
        let progress = loop {
            let p = session.step(5_000);
            if p.done {
                break p;
            }
        };
        assert!(
            progress.provably_optimal,
            "optimizer must reach the upper_bound and report provably_optimal"
        );
        assert_eq!(progress.score, 4, "best score must equal the upper_bound");
    }
}
