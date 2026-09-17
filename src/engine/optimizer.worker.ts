import {
  createOptimizerSession,
  type OptimizerProgress,
  type OptimizerSession,
} from "./optimizerSession";
import { initEngine, type EngineLayout } from "./wasm";

// Message protocol for the persistent optimizer worker.
// Cancellation is handled by `pause`; the worker is never terminated mid-run.
// The session (and its visited set) lives for the full lifetime of the worker.
export type WorkerIncoming =
  | { type: "init"; layout: EngineLayout; seed: number; iterBudget: number }
  | { type: "run"; chunkIters: number; chunkDelayMs: number }
  | { type: "reseat"; layout: EngineLayout }
  | { type: "pause" };

export type WorkerOutgoing =
  ({ type: "progress" } & OptimizerProgress) | { type: "error"; message: string };

// Keep running across per-run budgets until the search stalls (no new layouts
// in a complete run) or this wall-clock limit is exceeded. On a large grid
// "stalled" rarely fires, so the cap is the practical stop for those cases.
const RUN_TIME_CAP_MS = 60_000;

// Floor between non-terminal progress posts. Each post triggers a full board
// re-render on the main thread; with a 0ms chunk delay the chunk rate is
// bound only by compute time, so posts must be paced separately.
const PROGRESS_MIN_INTERVAL_MS = 33;

let session: OptimizerSession | null = null;
let running = false;

// Incremented per `run`. A loop that is no longer the current generation has
// been superseded and exits without posting: `run, pause, run` in quick
// succession would otherwise start the second loop before the first had
// observed the pause, stepping one session from two loops and posting two
// terminal snapshots for a single user-visible run.
let generation = 0;

// `run` and `reseat` are meaningless without a session, and the main thread has
// already flipped `optimizing` on by the time `run` arrives -- going quiet here
// leaves the button stuck on "Cancel" with nothing behind it.
function postNoSession(type: WorkerIncoming["type"]): void {
  postMessage({
    type: "error",
    message: `optimizer worker: no session for "${type}"; init failed or was never sent`,
  } satisfies WorkerOutgoing);
}

// Assigned via `self` (identical in a real worker) so test shims that only
// intercept properties of the worker global scope observe the handler.
self.onmessage = async (e: MessageEvent<WorkerIncoming>) => {
  const msg = e.data;
  try {
    // Engine init is idempotent (no-op after the first call).
    await initEngine();

    if (msg.type === "init") {
      // Detached before freeing/creating: if either throws, a stale `session`
      // would point at the freed wasm object and poison every subsequent
      // message.
      const old = session;
      session = null;
      old?.free();
      session = createOptimizerSession(msg.layout, msg.seed, msg.iterBudget);
      return;
    }

    if (msg.type === "reseat") {
      if (!session) {
        postNoSession(msg.type);
        return;
      }
      session.reseat(msg.layout);
      return;
    }

    if (msg.type === "pause") {
      running = false;
      return;
    }

    if (msg.type === "run") {
      if (!session) {
        postNoSession(msg.type);
        return;
      }
      const myGeneration = ++generation;
      running = true;
      session.restart_run();
      const { chunkIters, chunkDelayMs } = msg;
      const startMs = Date.now();
      let lastProgressMs = 0;
      let sentTerminal = false;

      while (running && myGeneration === generation) {
        const progress = session.step(chunkIters);
        const elapsed = Date.now() - startMs;

        if (progress.done) {
          const shouldStop =
            progress.stalled || elapsed >= RUN_TIME_CAP_MS || progress.provablyOptimal;
          if (shouldStop) {
            // Natural terminal stop: include all tied-best layouts.
            postMessage({
              type: "progress",
              ...progress,
              bestLayouts: session.best_layouts(),
            } satisfies WorkerOutgoing);
            sentTerminal = true;
            running = false;
            break;
          }
          // Budget exhausted but still exploring: restart and keep going.
          // Force done: false so the main thread doesn't flip optimizing off.
          session.restart_run();
          postMessage({ type: "progress", ...progress, done: false } satisfies WorkerOutgoing);
        } else if (Date.now() - lastProgressMs >= PROGRESS_MIN_INTERVAL_MS) {
          lastProgressMs = Date.now();
          postMessage({ type: "progress", ...progress } satisfies WorkerOutgoing);
        }

        // Yield to the event loop so `pause` messages can be processed between chunks.
        await new Promise<void>(resolve => setTimeout(resolve, chunkDelayMs));
      }

      // Paused externally: send a terminal snapshot with bestLayouts so the
      // main thread can populate the Prev/Next browser. A superseded loop stays
      // silent -- the run that replaced it owns the terminal message.
      if (!sentTerminal && myGeneration === generation) {
        const snapshot = session.step(0);
        postMessage({
          type: "progress",
          ...snapshot,
          done: true,
          bestLayouts: session.best_layouts(),
        } satisfies WorkerOutgoing);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    postMessage({
      type: "error",
      message: `optimizer worker failed: ${message}`,
    } satisfies WorkerOutgoing);
  }
};
