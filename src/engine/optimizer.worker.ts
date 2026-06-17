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
  | ({ type: "progress" } & OptimizerProgress)
  | { type: "error"; message: string };

let session: OptimizerSession | null = null;
let running = false;

onmessage = async (e: MessageEvent<WorkerIncoming>) => {
  const msg = e.data;
  try {
    // Engine init is idempotent (no-op after the first call).
    await initEngine();

    if (msg.type === "init") {
      session?.free();
      session = createOptimizerSession(msg.layout, msg.seed, msg.iterBudget);
      return;
    }

    if (msg.type === "reseat") {
      session?.reseat(msg.layout);
      return;
    }

    if (msg.type === "pause") {
      running = false;
      return;
    }

    if (msg.type === "run") {
      if (!session) return;
      running = true;
      session.restart_run();
      const { chunkIters, chunkDelayMs } = msg;
      while (running) {
        const progress = session.step(chunkIters);
        postMessage({ type: "progress", ...progress } satisfies WorkerOutgoing);
        if (progress.done) {
          running = false;
          break;
        }
        // Yield to the event loop so `pause` messages can be processed between chunks.
        await new Promise<void>(resolve => setTimeout(resolve, chunkDelayMs));
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
