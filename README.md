# smart-storage

A spatial inventory puzzle. Place polyomino-shaped items on a grid; adjacent items score +1 or -1 for each matching tag-synergy rule; maximize the total score. A built-in simulated-annealing optimizer (Rust compiled to WebAssembly, running in a Web Worker) rearranges your placements for a higher score while the board animates toward the result.

The app is fully client-side and statically deployable: React + TypeScript built with Vite, with all scoring and optimization in a Rust engine compiled to WASM. Pushes to `main` deploy automatically to GitHub Pages: **<https://mcopland.github.io/smart-storage/>**

## Prerequisites

- Node.js 22+
- Rust (stable, 1.77+) with the `wasm32-unknown-unknown` target: `rustup target add wasm32-unknown-unknown`
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
npm run preview    # serve the production bundle locally
npm test           # WASM + Vitest suite
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint (typescript-eslint + react-hooks, zero warnings allowed)
```

Rust engine checks (from `crates/engine`):

```sh
cargo test
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

CI runs all of the above plus `npx prettier --check .`, and non-blocking `cargo audit` / `npm audit` steps.

## Architecture

```
src/
  model/       TypeScript data model: item catalog, grid geometry (drag/fit checks),
               clusters, layout import validation, board-composition signature
  engine/      WASM bindings (wasm.ts), optimizer worker + main-thread client
  components/  React UI: grid surface + gesture hooks (drag/marquee/tray ghost),
               tray, score panel, modals, notices
  use*.ts      Hooks that own app state: useBoard (placements/inventory reducer),
               useOptimizer, useSelection, useItemTypes, useGridConfig,
               useCheckpoint, useLayoutIO, useNotice, ...
crates/engine/ Rust crate: model + scoring (score.rs) and the simulated-annealing
               optimizer (anneal.rs), exposed via wasm-bindgen (wasm.rs)
tests/         Vitest suites + JSON fixtures shared with the Rust tests
```

The **Rust engine is the single source of truth for scoring**: the live score panel calls into WASM synchronously, and the optimizer maximizes exactly the same function. TypeScript keeps its own geometry helpers (`fits`, `rotateCells`) for per-mousemove drag checks; the JSON fixtures in `tests/fixtures/` are asserted by both the cargo and Vitest suites, so the two implementations cannot drift.

The WASM boundary is typed end to end: the TS shapes of the objects crossing it (`EngineProgress`, `EnginePlacement`, ...) are declared in `wasm.rs` and emitted into the generated `.d.ts`, and engine functions return errors as catchable `Result`s rather than panicking (a panic would abort the WASM instance).

### Scoring model

An item's score is the sum of its synergy connections with orthogonally adjacent neighbors; there is no base score. For each adjacent pair (A, B), each of A's synergy rules whose tag appears in B's tags contributes +1 (or -1 for a negative rule), and vice versa.

### Optimizer

Simulated annealing over the positions and rotations of already-placed items (inventory is untouched). Moves are local translations, random relocations, rotations, and pairwise swaps, each validated against an occupancy grid so every intermediate state is legal. Score deltas are incremental (only edges touching the moved item are recomputed).

The session lives in a persistent Web Worker: the Optimize button toggles run/pause, and the worker steps a few thousand iterations at a time, posting the best layout so far so the UI animates and pause takes effect between chunks. Across runs the session remembers every distinct layout it has evaluated (deduplicated by adjacency structure) and skips repeats; moving pieces by hand reseats the session without discarding that memory, while changing the board's composition (items, tags, synergies, grid size, disabled cells) starts a fresh one.

Each run reports how many distinct layouts have been explored and a provable upper bound on the achievable score; when the best found score reaches that bound the layout is provably optimal and the search stops. All tied-best layouts are kept and can be browsed with Prev/Next in the score panel.

### Accessibility

The main surfaces are keyboard-operable: tray tiles, placed items, and composition rows are focusable buttons (Enter/Space selects), and the existing shortcuts (R rotate, Delete remove) act on the keyboard selection just as they do on a pointer selection.

## License

MIT — see [LICENSE](LICENSE).
