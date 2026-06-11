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
                final_layout.fits(p, Some(&p.id)),
                "{name}: optimizer produced an illegal placement: {p:?}"
            );
        }
        assert_eq!(
            calc_score(&final_layout).total,
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
    let initial = calc_score(&layout).total;
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
    let initial = calc_score(&layout).total;
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
