# smart-storage

A spatial inventory puzzle. Place polyomino-shaped items on a grid; adjacent items score +1 or -1 for each matching tag-synergy rule; maximize the total score. A built-in simulated-annealing optimizer (Rust compiled to WebAssembly, running in a Web Worker) rearranges your placements for a higher score while the board animates toward the result.

The app is fully client-side and statically deployable: React + TypeScript built with Vite, with all scoring and optimization in a Rust engine compiled to WASM.

## Prerequisites

- Node.js 22+
- Rust (stable) with the `wasm32-unknown-unknown` target: `rustup target add wasm32-unknown-unknown`
- [wasm-pack](https://rustwasm.github.io/wasm-pack/)

## Development

```sh
npm install
npm run dev        # builds the WASM engine, then starts Vite at http://localhost:5173
```

Other scripts:

```sh
npm run build:wasm # compile crates/engine to crates/engine/pkg (wasm-pack, web target)
npm run build      # WASM + typecheck + production bundle in dist/
npm test           # WASM + Vitest suite
npm run typecheck  # tsc --noEmit
```

Rust engine checks (from `crates/engine`):

```sh
cargo test
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

## Architecture

```
src/
  model/       TypeScript data model: item catalog, grid geometry (drag/fit checks),
               clusters, layout import validation
  engine/      WASM bindings (wasm.ts), optimizer worker + main-thread client
  components/  React UI: grid surface, tray, score panel, modals
crates/engine/ Rust crate: model + scoring (score.rs) and the simulated-annealing
               optimizer (anneal.rs), exposed via wasm-bindgen (wasm.rs)
tests/         Vitest suites + JSON fixtures shared with the Rust tests
```

The **Rust engine is the single source of truth for scoring**: the live score panel calls into WASM synchronously, and the optimizer maximizes exactly the same function. TypeScript keeps its own geometry helpers (`fits`, `rotateCells`) for per-mousemove drag checks; the JSON fixtures in `tests/fixtures/` are asserted by both the cargo and Vitest suites, so the two implementations cannot drift.

### Scoring model

An item's score is the sum of its synergy connections with orthogonally adjacent neighbors; there is no base score. For each adjacent pair (A, B), each of A's synergy rules whose tag appears in B's tags contributes +1 (or -1 for a negative rule), and vice versa.

### Optimizer

Simulated annealing over the positions and rotations of already-placed items (inventory is untouched). Moves are local translations, random relocations, rotations, and pairwise swaps, each validated against an occupancy grid so every intermediate state is legal. Score deltas are incremental (only edges touching the moved item are recomputed). The session is chunked: the worker steps a few thousand iterations at a time and posts the best layout so far, so the UI animates and Cancel takes effect immediately (the worker is simply terminated; the last applied layout stands).

## License

See [LICENSE](LICENSE).
