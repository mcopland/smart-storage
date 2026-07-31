// Drives the real optimizer worker (src/engine/optimizer.worker.ts) through
// createOptimizerClient using @vitest/web-worker, which runs the worker
// in-thread while preserving postMessage semantics. Covers the message
// protocol: progress ordering, restart-on-budget, pause semantics (terminal
// snapshot with bestLayouts), and error posting.
//
// One client is shared by the whole suite, mirroring production (App creates a
// single persistent worker; init() starts a fresh session). It is also a shim
// constraint: only the first Worker created by @vitest/web-worker shares the
// test's module graph, and later ones cannot load the WASM engine under Node.
import "@vitest/web-worker";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOptimizerClient, type OptimizerClient } from "../src/engine/optimizer";
import type { OptimizerProgress } from "../src/engine/optimizerSession";
import { dotLayout, initEngineFromDisk, synergyLayout } from "./helpers";

interface Harness {
  progresses: OptimizerProgress[];
  errors: string[];
  /** Resolves with the first progress where done: true. */
  terminal: Promise<OptimizerProgress>;
  /** Resolves with the first posted error message. */
  firstError: Promise<string>;
  /** Resolves the next time any progress arrives. */
  nextProgress(): Promise<OptimizerProgress>;
}

let client: OptimizerClient;
let currentSink: { onProgress(p: OptimizerProgress): void; onError(m: string): void };

// Fresh capture buffers for one test; the underlying client/worker persists.
function createHarness(): Harness {
  const progresses: OptimizerProgress[] = [];
  const errors: string[] = [];
  let resolveTerminal!: (p: OptimizerProgress) => void;
  let resolveError!: (m: string) => void;
  const waiters: ((p: OptimizerProgress) => void)[] = [];
  const terminal = new Promise<OptimizerProgress>(r => (resolveTerminal = r));
  const firstError = new Promise<string>(r => (resolveError = r));

  currentSink = {
    onProgress(progress) {
      progresses.push(progress);
      for (const w of waiters.splice(0)) w(progress);
      if (progress.done) resolveTerminal(progress);
    },
    onError(message) {
      errors.push(message);
      resolveError(message);
    },
  };
  return {
    progresses,
    errors,
    terminal,
    firstError,
    nextProgress: () => new Promise<OptimizerProgress>(r => waiters.push(r)),
  };
}

beforeAll(async () => {
  await initEngineFromDisk();
  client = createOptimizerClient(
    p => currentSink.onProgress(p),
    m => currentSink.onError(m),
  );
});

afterAll(() => {
  client.dispose();
});

describe("optimizer worker protocol", () => {
  it("runs to a natural terminal: monotone scores, done last, bestLayouts attached", async () => {
    const h = createHarness();
    client.init(synergyLayout, 42, 50_000);
    client.run(5_000, 0);

    const terminal = await h.terminal;

    expect(h.errors).toEqual([]);
    // The terminal message is the last one and the only done: true.
    expect(h.progresses.at(-1)).toBe(terminal);
    expect(h.progresses.filter(p => p.done)).toEqual([terminal]);
    // Best-so-far score never decreases across posts.
    for (let i = 1; i < h.progresses.length; i++) {
      expect(h.progresses[i].score).toBeGreaterThanOrEqual(h.progresses[i - 1].score);
    }
    // Natural stop on this layout is provable optimality at score 2.
    expect(terminal.provablyOptimal).toBe(true);
    expect(terminal.score).toBe(2);
    // Only the terminal message carries the tied-best layouts.
    expect(terminal.bestLayouts).toBeDefined();
    expect(terminal.bestLayouts!.length).toBe(terminal.bestLayoutCount);
    for (const p of h.progresses.slice(0, -1)) {
      expect(p.bestLayouts).toBeUndefined();
    }
  });

  it("restarts on budget exhaustion, forcing done: false until a real stop", async () => {
    const h = createHarness();
    // 6 free-floating dots on 6x6: no synergies, so never provably optimal,
    // and far too many distinct layouts to stall within a few tiny budgets.
    const dots = dotLayout(
      6,
      6,
      Array.from({ length: 6 }, (_, i): [number, number] => [i, 0]),
    );
    client.init(dots, 7, 200);
    client.run(200, 0);

    // A full budget consumed without stalling must surface as done: false
    // (the worker restarts the run instead of stopping).
    const restarted = await h.nextProgress();
    expect(restarted.done).toBe(false);
    expect(restarted.itersDone).toBe(200);

    client.pause();
    const terminal = await h.terminal;
    expect(terminal.done).toBe(true);
    expect(terminal.bestLayouts).toBeDefined();
    expect(h.errors).toEqual([]);
  });

  it("pause mid-run yields a terminal snapshot with bestLayouts", async () => {
    const h = createHarness();
    client.init(synergyLayout, 1, 1_000_000);
    // Small chunks with a nonzero delay so the pause message can interleave.
    client.run(50, 1);

    await h.nextProgress();
    client.pause();

    const terminal = await h.terminal;
    expect(terminal.done).toBe(true);
    expect(terminal.bestLayouts).toBeDefined();
    expect(h.progresses.filter(p => p.done)).toEqual([terminal]);
    expect(h.errors).toEqual([]);
  });

  it("posts an error for an invalid init layout and stays alive for a valid one", async () => {
    const h = createHarness();
    // Establish a healthy session first: a failed init must free it cleanly,
    // not leave a dangling wasm handle that poisons every later message.
    client.init(synergyLayout, 5, 1_000);
    client.init(
      { ...synergyLayout, placements: [{ id: "x1", type: "ghost", x: 0, y: 0, rot: 0 }] },
      0,
      1_000,
    );
    const message = await h.firstError;
    expect(message).toMatch(/optimizer worker failed/);
    expect(message).toMatch(/ghost/);

    // The worker survives the failed init: a valid session still runs.
    client.init(synergyLayout, 42, 50_000);
    client.run(5_000, 0);
    const terminal = await h.terminal;
    expect(terminal.score).toBe(2);
    expect(h.errors).toHaveLength(1);
  });

  it("reseat mid-session is accepted and the next run still terminates", async () => {
    const h = createHarness();
    client.init(synergyLayout, 9, 50_000);
    // Same ids, shifted positions: the reseat contract.
    client.reseat({
      ...synergyLayout,
      placements: [
        { id: "p0", type: "a", x: 1, y: 0, rot: 0 },
        { id: "p1", type: "b", x: 3, y: 0, rot: 0 },
      ],
    });
    client.run(5_000, 0);
    const terminal = await h.terminal;
    expect(terminal.score).toBe(2);
    expect(h.errors).toEqual([]);
  });
});
