//! Simulated-annealing optimizer over the positions and rotations of already
//! placed items. Item types, inventory, grid size, and disabled cells are
//! fixed inputs; every intermediate state is a legal layout.
//!
//! The session is chunked (`step(n)`) so a Web Worker can post progress and
//! honor cancellation between chunks instead of blocking in one long call.

use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};
use serde::Serialize;

use crate::model::{rotate_cells, Cell, Layout, Placement};
use crate::score::{calc_score, tag_synergy};

const T_START: f64 = 3.0;
const T_END: f64 = 0.05;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    /// Best layout found so far (not the current annealing state).
    pub placements: Vec<Placement>,
    pub score: i32,
    pub done: bool,
    pub iters_done: u32,
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
    /// Cell -> placement index, plus a parallel disabled mask.
    occ: Vec<Option<u16>>,
    disabled: Vec<bool>,
    cur: Vec<Pose>,
    cur_score: i32,
    best: Vec<Pose>,
    best_score: i32,
    rng: SmallRng,
    iter: u32,
    total_iters: u32,
    since_improve: u32,
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
                // Restart from the best layout when the walk stagnates.
                if self.since_improve >= stagnation_limit {
                    self.reset_to_best();
                    self.since_improve = 0;
                }
            }
        }
        Progress {
            placements: self.poses_to_placements(&self.best),
            score: self.best_score,
            done: self.iter >= self.total_iters,
            iters_done: self.iter,
        }
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
