import { createOptimizerSession, type OptimizerProgress } from "./optimizerSession";
import { initEngine, type EngineLayout } from "./wasm";

// Cancellation is Worker.terminate() from the client; the worker itself only
// streams progress. Chunked stepping keeps each WASM call short and paces the
// UI animation.
export interface OptimizerWorkerStart {
  layout: EngineLayout;
  seed: number;
  totalIters: number;
  chunkIters: number;
  // Pause between chunks so the board visibly animates toward the result.
  chunkDelayMs: number;
}

export type OptimizerWorkerResponse =
  | ({ type: "progress" } & OptimizerProgress)
  | { type: "error"; message: string };

onmessage = async (e: MessageEvent<OptimizerWorkerStart>) => {
  const { layout, seed, totalIters, chunkIters, chunkDelayMs } = e.data;
  try {
    await initEngine();
    const session = createOptimizerSession(layout, seed, totalIters);
    try {
      for (;;) {
        const progress = session.step(chunkIters);
        postMessage({ type: "progress", ...progress });
        if (progress.done) break;
        await new Promise(resolve => setTimeout(resolve, chunkDelayMs));
      }
    } finally {
      session.free();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    postMessage({ type: "error", message: `optimizer worker failed: ${message}` });
  }
};
