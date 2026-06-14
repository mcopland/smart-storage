import { useEffect, useRef, useState } from "react";
import { startOptimizer, type OptimizeHandle } from "./engine/optimizer";
import type { ItemType, Placement } from "./model/types";

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
  // Called when the optimizer starts, so App can clear selection state.
  onStart: () => void;
  onProgress: (placements: Placement[]) => void;
}): { optimizing: boolean; onOptimize: () => void } {
  const [optimizing, setOptimizing] = useState(false);
  const handleRef = useRef<OptimizeHandle | null>(null);

  // Cancel any in-flight optimizer when the component unmounts.
  useEffect(() => {
    return () => {
      handleRef.current?.cancel();
    };
  }, []);

  const onOptimize = () => {
    if (optimizing) {
      handleRef.current?.cancel();
      handleRef.current = null;
      setOptimizing(false);
      return;
    }
    if (placements.length === 0) return;
    setOptimizing(true);
    onStart();
    handleRef.current = startOptimizer(
      { itemTypes, gridW, gridH, disabledCells: Array.from(disabledCells), placements },
      { seed: Date.now() >>> 0, totalIters: 200_000, chunkIters: 5_000, chunkDelayMs: 30 },
      progress => {
        onProgress(progress.placements);
        if (progress.done) {
          handleRef.current = null;
          setOptimizing(false);
        }
      },
      message => {
        console.error(`Optimize failed: ${message}`);
        handleRef.current = null;
        setOptimizing(false);
      },
    );
  };

  return { optimizing, onOptimize };
}
