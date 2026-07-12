//! Invariants for the simulated-annealing optimizer. The optimizer searches
//! over positions and rotations of already-placed items; inventory, item
//! types, grid size, and disabled cells are fixed inputs.

use std::path::PathBuf;

use engine::anneal::OptimizerSession;
use engine::model::Layout;
use engine::score::calc_score;

fn load_layout(name: &str) -> Layout {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixtures")
        .join(name);
    let data = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("failed to read fixture {}: {e}", path.display()));
    serde_json::from_str(&data)
        .unwrap_or_else(|e| panic!("failed to parse fixture {}: {e}", path.display()))
}

fn run_to_completion(session: &mut OptimizerSession, chunk: u32) -> engine::anneal::Progress {
    loop {
        let progress = session.step(chunk);
        if progress.done {
            return progress;
        }
    }
}

#[test]
fn final_placements_are_legal_and_score_is_consistent() {
    // fits.json has disabled cells, so legality must respect them too.
    for name in ["score-default.json", "fits.json"] {
        let layout = load_layout(name);
        let mut session = OptimizerSession::new(&layout, 42, 30_000)
            .unwrap_or_else(|e| panic!("{name}: failed to create session: {e}"));
        let progress = run_to_completion(&mut session, 5_000);

        let final_layout = Layout {
            placements: progress.placements.clone(),
            ..layout.clone()
        };
        for p in &final_layout.placements {
            assert!(
                final_layout
                    .fits(p, Some(&p.id))
                    .expect("final layout references only known types"),
                "{name}: optimizer produced an illegal placement: {p:?}"
            );
        }
        assert_eq!(
            calc_score(&final_layout)
                .expect("final layout must score")
                .total,
            progress.score,
            "{name}: reported score must match calc_score on the final layout"
        );
    }
}

#[test]
fn same_seed_is_deterministic() {
    let layout = load_layout("score-default.json");
    let run = |seed: u32| {
        let mut session = OptimizerSession::new(&layout, seed, 20_000)
            .expect("failed to create session for determinism run");
        run_to_completion(&mut session, 3_000)
    };
    let a = run(7);
    let b = run(7);
    assert_eq!(a.score, b.score, "same seed must give the same score");
    assert_eq!(
        a.placements, b.placements,
        "same seed must give the same placements"
    );
}

#[test]
fn best_so_far_is_monotone_and_never_below_initial() {
    let layout = load_layout("score-default.json");
    let initial = calc_score(&layout).expect("fixture must score").total;
    let mut session = OptimizerSession::new(&layout, 1, 25_000).expect("failed to create session");
    let mut last = i32::MIN;
    loop {
        let progress = session.step(2_500);
        assert!(
            progress.score >= last,
            "best-so-far regressed: {} -> {}",
            last,
            progress.score
        );
        assert!(
            progress.score >= initial,
            "best-so-far {} fell below the starting score {initial}",
            progress.score
        );
        last = progress.score;
        if progress.done {
            break;
        }
    }
}

#[test]
fn anneal_beats_random_relocation_baseline() {
    let layout = load_layout("score-default.json");
    let mut session =
        OptimizerSession::new(&layout, 1234, 40_000).expect("failed to create session");
    let annealed = run_to_completion(&mut session, 10_000).score;
    let baseline = OptimizerSession::random_baseline(&layout, 1234, 40_000)
        .expect("failed to run random baseline");
    assert!(
        annealed >= baseline,
        "annealing ({annealed}) must not lose to the random baseline ({baseline})"
    );
    let initial = calc_score(&layout).expect("fixture must score").total;
    assert!(
        annealed > initial,
        "annealing ({annealed}) should improve on the default layout's score ({initial})"
    );
}

#[test]
fn empty_layout_finishes_immediately() {
    let layout = load_layout("score-empty.json");
    let mut session = OptimizerSession::new(&layout, 0, 10_000).expect("failed to create session");
    let progress = session.step(1);
    assert!(progress.done, "an empty layout has nothing to optimize");
    assert_eq!(progress.score, 0);
    assert!(progress.placements.is_empty());
}

#[test]
fn unknown_item_type_is_rejected_at_construction() {
    let mut layout = load_layout("score-default.json");
    layout.placements[0].type_id = "ghost".to_string();
    let err = OptimizerSession::new(&layout, 0, 1_000)
        .err()
        .expect("constructing a session with an unknown item type must fail");
    assert!(
        err.contains("ghost"),
        "error should name the unknown type, got: {err}"
    );
}

// --- visited registry ---

#[test]
fn explored_starts_at_one_and_grows() {
    // The initial layout is recorded on construction; explored must be >= 1
    // immediately and grow as the annealer visits new layouts.
    let layout = load_layout("score-default.json");
    let mut session = OptimizerSession::new(&layout, 42, 5_000).expect("session");
    let first = session.step(0);
    assert!(
        first.explored >= 1,
        "explored must be >= 1 immediately after construction, got {}",
        first.explored
    );
    let after = run_to_completion(&mut session, 1_000);
    assert!(
        after.explored > first.explored,
        "explored must grow during a run ({} -> {})",
        first.explored,
        after.explored
    );
}

#[test]
fn stalled_is_true_when_no_new_layouts_found() {
    // A single 1x1 cell item on a 1x1 grid has exactly one legal layout.
    // After that fingerprint is recorded on construction, the optimizer can
    // never find a new valid position; the run must stall.
    use engine::model::{ItemType, Layout, Placement};
    let layout = Layout {
        item_types: vec![ItemType {
            id: "dot".to_string(),
            tags: vec![],
            synergies: vec![],
            cells: vec![(0, 0)],
        }],
        grid_w: 1,
        grid_h: 1,
        disabled_cells: vec![],
        placements: vec![Placement {
            id: "p0".to_string(),
            type_id: "dot".to_string(),
            x: 0,
            y: 0,
            rot: 0,
        }],
    };
    let mut session = OptimizerSession::new(&layout, 0, 1_000).expect("session");
    let progress = run_to_completion(&mut session, 500);
    assert!(
        progress.stalled,
        "a single-layout search space must report stalled=true, got explored={}",
        progress.explored
    );
}

#[test]
fn restart_run_resets_iter_but_keeps_visited() {
    let layout = load_layout("score-default.json");
    let mut session = OptimizerSession::new(&layout, 7, 5_000).expect("session");
    let done = run_to_completion(&mut session, 1_000);
    assert!(done.done);
    let explored_after_run = done.explored;

    session.restart_run();

    // iter resets to 0: step(0) should report done=false and iters_done=0.
    let after_restart = session.step(0);
    assert!(
        !after_restart.done,
        "after restart_run the run must not be done immediately"
    );
    assert_eq!(
        after_restart.iters_done, 0,
        "iters_done must reset to 0 after restart_run"
    );
    // visited is kept: explored must be at least as large.
    assert!(
        after_restart.explored >= explored_after_run,
        "explored must not shrink after restart_run ({} -> {})",
        explored_after_run,
        after_restart.explored
    );
}

#[test]
fn reseat_keeps_visited_and_updates_cur() {
    let layout = load_layout("score-default.json");
    let mut session = OptimizerSession::new(&layout, 1, 10_000).expect("session");
    let done = run_to_completion(&mut session, 2_000);
    let explored_before = done.explored;
    let best_placements = done.placements.clone();

    // Reseat to the best placements the optimizer found (same composition).
    let reseated_layout = engine::model::Layout {
        placements: best_placements,
        ..layout.clone()
    };
    session
        .reseat(&reseated_layout)
        .expect("reseat must succeed for same composition");

    // explored must not decrease (visited is kept).
    let after_reseat = session.step(0);
    assert!(
        after_reseat.explored >= explored_before,
        "explored must not shrink after reseat ({} -> {})",
        explored_before,
        after_reseat.explored
    );
    // iter resets: done=false (assuming total_iters > 0).
    assert!(
        !after_reseat.done,
        "reseat must reset the run-iteration counter"
    );
}

#[test]
fn reseat_rejects_wrong_composition() {
    let mut layout = load_layout("score-default.json");
    let mut session = OptimizerSession::new(&layout, 0, 1_000).expect("session");
    // Drop a placement so the composition no longer matches.
    layout.placements.pop();
    session
        .reseat(&layout)
        .expect_err("reseat must fail when a placement id is missing");
}
