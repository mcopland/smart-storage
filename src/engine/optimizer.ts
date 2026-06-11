import type { OptimizerProgress } from "./optimizerSession";
import type { OptimizerWorkerResponse, OptimizerWorkerStart } from "./optimizer.worker";
import type { EngineLayout } from "./wasm";

export interface OptimizeOptions {
  seed: number;
  totalIters: number;
  chunkIters: number;
  chunkDelayMs: number;
}

export interface OptimizeHandle {
  cancel(): void;
}

// Runs the annealing session in a Web Worker so the UI thread never blocks.
// onProgress fires per chunk with the best layout so far; cancel() terminates
// the worker immediately (the last applied progress simply stands).
export function startOptimizer(
  layout: EngineLayout,
  options: OptimizeOptions,
  onProgress: (progress: OptimizerProgress) => void,
  onError: (message: string) => void,
): OptimizeHandle {
  const worker = new Worker(new URL("./optimizer.worker.ts", import.meta.url), {
    type: "module",
  });
  const stop = () => worker.terminate();
  worker.onmessage = (e: MessageEvent<OptimizerWorkerResponse>) => {
    const msg = e.data;
    if (msg.type === "error") {
      stop();
      onError(msg.message);
      return;
    }
    if (msg.done) stop();
    onProgress(msg);
  };
  worker.onerror = e => {
    stop();
    onError(`optimizer worker crashed: ${e.message}`);
  };
  const start: OptimizerWorkerStart = { layout, ...options };
  worker.postMessage(start);
  return { cancel: stop };
}
