import { useCallback } from "react";
import { cellsOf, resizeFit } from "./model/geometry";
import type { GridSize, Placement, TypesById } from "./model/types";
import type { BoardActions } from "./useBoard";

// Operations on the grid's shape: safe resize (compacting placements toward
// the shrinking edge) and Alt+click disabled-cell toggling. The gridSize and
// disabledCells state stays in App because sibling hooks consume the values.
export function useGridConfig({
  placements,
  typeById,
  board,
  gridW,
  gridH,
  setGridSize,
  disabledCells,
  setDisabledCells,
}: {
  placements: Placement[];
  typeById: TypesById;
  board: BoardActions;
  gridW: number;
  gridH: number;
  setGridSize: React.Dispatch<React.SetStateAction<GridSize>>;
  disabledCells: Set<string>;
  setDisabledCells: React.Dispatch<React.SetStateAction<Set<string>>>;
}): {
  onSafeResizeW: (newW: number) => void;
  onSafeResizeH: (newH: number) => void;
  toggleDisabledCell: (cx: number, cy: number) => void;
} {
  // Safe grid resize: compacts placements toward the shrinking edge so empty
  // space on either side can be reclaimed; only blocks if the occupied span
  // genuinely can't fit the requested size.
  const onSafeResizeW = useCallback(
    (newW: number) => {
      const w = Math.max(2, Math.min(20, newW));
      const res = resizeFit(placements, disabledCells, w, gridH, typeById);
      if (!res) return;
      board.setPlacements(res.placements);
      setDisabledCells(res.disabled);
      setGridSize(prev => ({ ...prev, w }));
    },
    [placements, disabledCells, gridH, typeById, board, setGridSize, setDisabledCells],
  );

  const onSafeResizeH = useCallback(
    (newH: number) => {
      const h = Math.max(2, Math.min(20, newH));
      const res = resizeFit(placements, disabledCells, gridW, h, typeById);
      if (!res) return;
      board.setPlacements(res.placements);
      setDisabledCells(res.disabled);
      setGridSize(prev => ({ ...prev, h }));
    },
    [placements, disabledCells, gridW, typeById, board, setGridSize, setDisabledCells],
  );

  const toggleDisabledCell = useCallback(
    (cx: number, cy: number) => {
      const key = `${cx},${cy}`;
      const occupied = placements.some(p =>
        cellsOf(p, typeById).some(([x, y]) => x === cx && y === cy),
      );
      if (occupied) return;
      setDisabledCells(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [placements, typeById, setDisabledCells],
  );

  return { onSafeResizeW, onSafeResizeH, toggleDisabledCell };
}
