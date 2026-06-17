import { useEffect, useMemo, useRef, useState } from "react";
import { createOptimizerClient, type OptimizerClient } from "./engine/optimizer";
import type { ItemType, Placement } from "./model/types";
import { boardSignature } from "./model/searchSpace";

const CHUNK_ITERS = 5_000;
const CHUNK_DELAY_MS = 30;
const ITER_BUDGET = 200_000;

export interface OptimizerStats {
  // Total distinct layouts evaluated in this session.
  explored: number;
  // True when the last completed run found no new layouts.
  stalled: boolean;
  // Best score reported by the engine across all runs. Null until the first
  // progress report arrives.
  bestScore: number | null;
}

export function useOptimizer({
  placements,
  itemTypes,
  gridW,
  gridH,
  disabledCells,
  onStart,
  onProgress,
}: {
  placements: Placement[];
  itemTypes: ItemType[];
  gridW: number;
  gridH: number;
  disabledCells: Set<string>;
  // Called once when a run begins (so App can clear selection state).
  onStart: () => void;
  onProgress: (placements: Placement[]) => void;
}): { optimizing: boolean; onOptimize: () => void } & OptimizerStats {
  const [optimizing, setOptimizing] = useState(false);
  const [explored, setExplored] = useState(0);
  const [stalled, setStalled] = useState(false);
  const [bestScore, setBestScore] = useState<number | null>(null);

  // Stable refs so callbacks created inside useEffect see the latest values.
  const onProgressRef = useRef(onProgress);
  const onStartRef = useRef(onStart);
  onProgressRef.current = onProgress;
  onStartRef.current = onStart;

  const clientRef = useRef<OptimizerClient | null>(null);
  // The board signature at the time of the last init call.
  const sigRef = useRef<string | null>(null);
  // Whether a session has been initialized in the worker yet.
  const initializedRef = useRef(false);
  // Guard: don't reseat while a run is in progress (the worker is moving pieces).
  const optimizingRef = useRef(false);
  optimizingRef.current = optimizing;

  // Create the persistent worker once; destroy on unmount.
  useEffect(() => {
    const client = createOptimizerClient(
      progress => {
        onProgressRef.current(progress.placements);
        setExplored(progress.explored);
        setStalled(progress.stalled);
        setBestScore(prev => (prev === null || progress.score > prev ? progress.score : prev));
        if (progress.done) {
          setOptimizing(false);
        }
      },
      message => {
        console.error(`Optimize failed: ${message}`);
        setOptimizing(false);
      },
    );
    clientRef.current = client;
    return () => {
      client.dispose();
      clientRef.current = null;
      initializedRef.current = false;
      sigRef.current = null;
    };
  }, []);

  // Stable board signature: changes only when the scoring-relevant composition
  // changes, not on position/rotation moves (which the worker handles via reseat).
  const sig = useMemo(
    () => boardSignature(itemTypes, placements, gridW, gridH, disabledCells),
    [itemTypes, placements, gridW, gridH, disabledCells],
  );

  // Keep the worker's session in sync with the board state.
  useEffect(() => {
    const client = clientRef.current;
    if (!client || placements.length === 0) return;
    // Skip while a run is in progress: the worker is driving placements,
    // not the UI. The effect will re-fire once the run finishes (optimizing
    // flips to false) and reseat to the final best layout then.
    if (optimizingRef.current) return;

    const layout = {
      itemTypes,
      gridW,
      gridH,
      disabledCells: Array.from(disabledCells),
      placements,
    };

    if (!initializedRef.current || sig !== sigRef.current) {
      // Composition changed or first mount: new session, fresh visited set.
      client.init(layout, Date.now() >>> 0, ITER_BUDGET);
      sigRef.current = sig;
      initializedRef.current = true;
      setExplored(0);
      setStalled(false);
      setBestScore(null);
    } else {
      // Same composition, positions/rotations changed: keep visited set.
      client.reseat(layout);
    }
  }, [sig, placements, itemTypes, gridW, gridH, disabledCells, optimizing]);

  const onOptimize = () => {
    const client = clientRef.current;
    if (!client) return;

    if (optimizing) {
      client.pause();
      setOptimizing(false);
      return;
    }
    if (placements.length === 0) return;

    setOptimizing(true);
    onStartRef.current();
    client.run(CHUNK_ITERS, CHUNK_DELAY_MS);
  };

  return { optimizing, onOptimize, explored, stalled, bestScore };
}
