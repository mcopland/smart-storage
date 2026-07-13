# Optimizer hot-loop: incremental adjacency fingerprint + record_best reorder

- **Date:** 2026-07-12
- **Tier:** M
- **Status:** implemented
- **Branch:** main

## Context

A review of the Optimize functionality's calculation process (requested by the user: "is it the best, most efficient method, and is it providing the optimal result?") found the method sound — simulated annealing with basin-hopping restarts over a quadratic-assignment-style NP-hard placement problem, with incremental delta scoring and a sound optimality certificate — but identified two avoidable full-board scans dominating the hot loop, plus idle time in the worker's chunk pacing. Optimality is not guaranteed (SA is a metaheuristic; only certified when `best_score` reaches the degree-relaxation upper bound), and that limitation is honestly reported by the UI; no change needed there.

## Evidence

- Baseline timing (temporary `crates/engine/tests/perf_tmp.rs`, 20 mixed-shape items with synergies on a 14×14 grid, native release build):

```
$ cargo test --release --test perf_tmp -- --nocapture
step(200_000): 2.893133208s (69 iters/ms), score 41, explored 39513
```

- `adjacency_fp_cached` ran on every legal proposal (`try_single`/`try_swap`): full cell→item HashMap rebuild + 4-neighborhood scan + sort per iteration, vs O(item-perimeter) for the score delta. An in-code TODO acknowledged it.
- `record_best` computed `composition_fp` (full-board scan) before comparing `cur_score` to `best_score`, so every accepted below-best move paid it.
- `CHUNK_DELAY_MS = 30` in `src/useOptimizer.ts` cost 40 × 30 ms = 1.2 s idle per 200k-iteration run; `setTimeout(0)` yields the worker's message queue just as well, so `pause` handling is unaffected.

## Approach

1. **`record_best` reorder** (`crates/engine/src/anneal.rs`): early-return when `cur_score < best_score` before computing `composition_fp`. Pure reorder.
2. **Incremental adjacency fingerprint** (`anneal.rs`, resolves the TODO):
   - Change the digest from "FNV-1a over the sorted pair multiset" to a wrapping-add of per-pair splitmix64 hashes (`pair_hash`). Commutative, so order-independent with multiplicity preserved; same equivalence classes, different values (fps are session-local, never persisted).
   - Replace `edges_of` with `edge_stats`, returning the score sum and the pair-hash sum from the same walk; proposals compute the new fingerprint as `cur_fp − removed + added` instead of recomputing from scratch.
   - The existing remove/insert ordering in `try_swap` already ensures each changed pair is counted exactly once per side; the fp sums ride on it.
   - `cur_fp` recomputed from scratch (via the retained `adjacency_fp` oracle function) on wholesale `cur` replacement: `new`, `reseat`, `reset_to_best` (a handful of times per run — cheap).
3. **`CHUNK_DELAY_MS` 30 → 0** (`src/useOptimizer.ts`).

Alternatives considered: only fingerprinting accepted moves (changes the `explored` counter semantics — rejected); tighter upper bound and exact search for small boards (out of scope, research-grade).

## Test plan

Written first (TDD), failing before implementation:

- `incremental_fp_matches_full_recompute_after_random_walk`: `cur_fp` equals the from-scratch `adjacency_fp` oracle at construction, after chunked walks spanning several stagnation resets and kicks, after `restart_run`, after `reseat`, and after a post-reseat walk.
- `adjacency_fp_differs_for_pair_multiplicity`: one A-B adjacency vs two must hash differently (guards the commutative-sum scheme).

Verification: `cargo test` + `cargo clippy --all-targets -- -D warnings` + `cargo fmt --check`; `npm test` (shared fixtures must stay green); eslint, tsc, prettier; manual Optimize run in the browser; before/after timing.

## Review Request

1. Is the incremental fp exactly equal to the oracle on every path that mutates `cur` (especially the try_swap four-stat discipline)?
2. Does the wrapping-add digest weaken collision resistance enough to matter at MAX_VISITED = 1M entries? (Analysis: birthday bound at 64 bits ≈ 2⁻²⁵ collision probability for 1M entries — acceptable.)
3. Any behavioral change to `explored` counting or stall detection?

## Findings log

| # | Stage | Finding (one line) | Verdict | Rationale / evidence |
| --- | --- | --- | --- | --- |
| 1 | code-review | CHUNK_DELAY_MS=0 removes the only throttle on progress postMessage; each message drives a full board re-render, and faster chunks flood the main thread | ACCEPT | Confirmed by two independent angles; App.tsx routes every progress message to `setPlacements`. Fixed: worker now paces non-terminal progress posts to ≥33 ms apart (`PROGRESS_MIN_INTERVAL_MS`), keeping compute unthrottled and pause responsive |
| 2 | code-review | `cur_fp` is kept in sync by convention across five mutation sites with no structural guard; a future move type could silently desync it | ACCEPT | Fixed: `debug_assert_eq!(cur_fp, adjacency_fp(cur))` at the end of `step()` — one cheap per-chunk recompute in debug builds catches any desync in every test run |
| 3 | code-review | After the early return, the `cur_score == best_score` clause in `record_best`'s else-if is always true | ACCEPT | Fixed: clause dropped, comment notes the guard above excludes below-best |
| 4 | code-review | New fp test repeats the same 3-line assert block five times | ACCEPT | Fixed: local `assert_fp(&session, at)` helper |
| 5 | code-review | `edge_stats` heap-allocates a `Vec` per call, "up from" the old code | DECLINE | Factually wrong as a regression: old `edges_of` was called identically (2× per single, 4× per swap) with the same `Vec::with_capacity(8)`; allocation behavior is unchanged by this diff |
| 6 | code-review | `composition_fp` still runs a full-board scan on every score-tie step (common on plateaus) | DECLINE | Pre-existing cost that this diff already reduced (was: every accepted move). An incremental per-type-totals tracker is a sound follow-up but out of this plan's scope |
| 7 | code-review | `pair_hash` recomputes splitmix64 for the same small type-pair domain; a precomputed table would be cheaper | DECLINE | ~6 ALU ops vs a memory load — unmeasurable at the measured 1170 iters/ms; not worth the extra state |
| 8 | code-review | New test asserts private `cur_fp` field, against rust.md's "assert observable behavior" preference | DECLINE | The approved plan explicitly requires the incremental-vs-oracle equality test; the invariant is unobservable through the public API by design (fp values never cross the boundary). White-box oracle tests are the standard pattern here |
| 9 | code-review | Fingerprint sub/add arithmetic is hand-duplicated between `try_single` and `try_swap` | DECLINE | It mirrors the existing score-delta duplication, which exists to keep the remove/insert ordering discipline visible at each site; a helper would obscure it for one saved line |

### Review verdicts

| Gate | Verdict | Date |
| --- | --- | --- |
| Plan review | approved by user in plan mode (edited) | 2026-07-12 |
| Sign-off | approved by Michael Copland | 2026-07-12 |
| Impl review | SHIP (no findings; fingerprint algebra, throttle terminal-path, and pause yield all independently verified) | 2026-07-12 |
| Browser verify | PASS — 60 fps main thread during run, explored climbing, score 10→19, pause/resume + interaction clean, no console errors | 2026-07-12 |

## Results

Same harness, after the change:

```
step(200_000): 171.53ms (1170 iters/ms), score 41, explored 39513
```

~17× faster; identical score and explored count (same equivalence classes, same walk — the RNG sequence is untouched). All 58 cargo tests and 137 Vitest tests pass; clippy/fmt/eslint/tsc/prettier clean.
