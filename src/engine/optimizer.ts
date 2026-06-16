import type { OptimizerProgress } from "./optimizerSession";
import type { WorkerIncoming, WorkerOutgoing } from "./optimizer.worker";
import type { EngineLayout } from "./wasm";

export interface OptimizerClient {
  // Replace the session entirely (resets visited set). Call when board
  // composition changes (item added/removed, type edited, grid resized).
  init(layout: EngineLayout, seed: number, iterBudget: number): void;
  // Start one annealing run (temperature resets; visited set carries over).
  run(chunkIters: number, chunkDelayMs: number): void;
  // Stop the current run without terminating the worker.
  pause(): void;
  // Update positions without clearing the visited set. Call when the user
  // manually moves a piece while keeping the same item set.
  reseat(layout: EngineLayout): void;
  // Terminate the worker permanently.
  dispose(): void;
}

// Creates a persistent Web Worker that owns the optimizer session across
// multiple Optimize presses. Only dispose() terminates the worker.
export function createOptimizerClient(
  onProgress: (progress: OptimizerProgress) => void,
  onError: (message: string) => void,
): OptimizerClient {
  const worker = new Worker(new URL("./optimizer.worker.ts", import.meta.url), {
    type: "module",
  });

  worker.onmessage = (e: MessageEvent<WorkerOutgoing>) => {
    const msg = e.data;
    if (msg.type === "error") {
      onError(msg.message);
      return;
    }
    onProgress(msg);
  };

  worker.onerror = e => {
    onError(`optimizer worker crashed: ${e.message ?? "unknown error"}`);
  };

  const send = (msg: WorkerIncoming) => worker.postMessage(msg);

  return {
    init(layout, seed, iterBudget) {
      send({ type: "init", layout, seed, iterBudget });
    },
    run(chunkIters, chunkDelayMs) {
      send({ type: "run", chunkIters, chunkDelayMs });
    },
    pause() {
      send({ type: "pause" });
    },
    reseat(layout) {
      send({ type: "reseat", layout });
    },
    dispose() {
      worker.terminate();
    },
  };
}
