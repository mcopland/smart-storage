import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createOptimizerClient, type OptimizerClient } from "./engine/optimizer";
import type { ItemType, Placement } from "./model/types";
import { boardSignature } from "./model/searchSpace";

const CHUNK_ITERS = 5_000;
// 0 still yields the worker's event loop between chunks (setTimeout macrotask),
// so pause messages are processed without adding idle time to the run.
const CHUNK_DELAY_MS = 0;
const ITER_BUDGET = 200_000;

export interface OptimizerStats {
  // Total distinct layouts evaluated in this session.
  explored: number;
  // True when the last completed run found no new layouts.
  stalled: boolean;
  // Live count of distinct tied-best layouts known so far.
  bestLayoutCount: number;
  // All tied-best layouts received in the terminal message. Empty while
  // a run is in progress or before the first run completes.
  bestLayouts: Placement[][];
  // Index into bestLayouts that is currently applied to the board.
  layoutIndex: number;
  // Provable upper bound on the achievable score; null until the first run.
  upperBound: number | null;
  // True when the best score equals the upper bound (provably optimal).
  provablyOptimal: boolean;
}

export function useOptimizer({
  placements,
  itemTypes,
  gridW,
  gridH,
  disabledCells,
  onStart,
  onProgress,
  onError,
}: {
  placements: Placement[];
  itemTypes: ItemType[];
  gridW: number;
  gridH: number;
  disabledCells: Set<string>;
  // Called once when a run begins (so App can clear selection state).
  onStart: () => void;
  onProgress: (placements: Placement[]) => void;
  // Called when the worker reports an unrecoverable error.
  onError?: (msg: string) => void;
}): {
  optimizing: boolean;
  onOptimize: () => void;
  onPrevLayout: () => void;
  onNextLayout: () => void;
} & OptimizerStats {
  const [optimizing, setOptimizing] = useState(false);
  const [explored, setExplored] = useState(0);
  const [stalled, setStalled] = useState(false);
  const [bestLayoutCount, setBestLayoutCount] = useState(0);
  const [bestLayouts, setBestLayouts] = useState<Placement[][]>([]);
  const [layoutIndex, setLayoutIndex] = useState(0);
  const [upperBound, setUpperBound] = useState<number | null>(null);
  const [provablyOptimal, setProvablyOptimal] = useState(false);

  // Stable refs so callbacks created inside useEffect see the latest values
  // without becoming stale closures.
  const onProgressRef = useRef(onProgress);
  const onStartRef = useRef(onStart);
  const onErrorRef = useRef(onError);

  // Refs that mirror state values so stable callbacks (Prev/Next) can read
  // the latest values without depending on them.
  const bestLayoutsRef = useRef<Placement[][]>([]);
  const layoutIndexRef = useRef(0);

  const clientRef = useRef<OptimizerClient | null>(null);
  // The board signature at the time of the last init call.
  const sigRef = useRef<string | null>(null);
  // Whether a session has been initialized in the worker yet.
  const initializedRef = useRef(false);
  // Guard: don't reseat while a run is in progress (the worker is moving pieces).
  const optimizingRef = useRef(false);

  // Mirror the latest values after every commit. Declared before the
  // board-sync effect below so its reads of optimizingRef are fresh; all
  // other consumers are event or worker callbacks, which run later anyway.
  useEffect(() => {
    onProgressRef.current = onProgress;
    onStartRef.current = onStart;
    onErrorRef.current = onError;
    bestLayoutsRef.current = bestLayouts;
    layoutIndexRef.current = layoutIndex;
    optimizingRef.current = optimizing;
  });

  // Create the persistent worker once; destroy on unmount.
  useEffect(() => {
    const client = createOptimizerClient(
      progress => {
        onProgressRef.current(progress.placements);
        setExplored(progress.explored);
        setStalled(progress.stalled);
        setBestLayoutCount(progress.bestLayoutCount);
        setUpperBound(progress.upperBound);
        setProvablyOptimal(progress.provablyOptimal);
        if (progress.done) {
          setOptimizing(false);
          if (progress.bestLayouts && progress.bestLayouts.length > 0) {
            setBestLayouts(progress.bestLayouts);
            setLayoutIndex(0);
          }
        }
      },
      message => {
        console.error(`Optimize failed: ${message}`);
        onErrorRef.current?.(`Optimize failed: ${message}`);
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
      setBestLayoutCount(0);
      setBestLayouts([]);
      setLayoutIndex(0);
      setUpperBound(null);
      setProvablyOptimal(false);
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
    setBestLayouts([]);
    setLayoutIndex(0);
    onStartRef.current();
    client.run(CHUNK_ITERS, CHUNK_DELAY_MS);
  };

  const onPrevLayout = useCallback(() => {
    const layouts = bestLayoutsRef.current;
    if (layouts.length < 2) return;
    const next = (layoutIndexRef.current - 1 + layouts.length) % layouts.length;
    setLayoutIndex(next);
    onProgressRef.current(layouts[next]);
  }, []);

  const onNextLayout = useCallback(() => {
    const layouts = bestLayoutsRef.current;
    if (layouts.length < 2) return;
    const next = (layoutIndexRef.current + 1) % layouts.length;
    setLayoutIndex(next);
    onProgressRef.current(layouts[next]);
  }, []);

  return {
    optimizing,
    onOptimize,
    onPrevLayout,
    onNextLayout,
    explored,
    stalled,
    bestLayoutCount,
    bestLayouts,
    layoutIndex,
    upperBound,
    provablyOptimal,
  };
}
