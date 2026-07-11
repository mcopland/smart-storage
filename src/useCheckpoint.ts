import { useCallback, useState } from "react";
import type { GridSize, Inventory, ItemType, Placement } from "./model/types";
import type { BoardActions } from "./useBoard";

interface Checkpoint {
  gridSize: GridSize;
  placements: Placement[];
  inventory: Inventory;
  disabledCells: Set<string>;
  itemTypes: ItemType[];
}

// Manual save/revert of the full board state (grid, placements, inventory,
// disabled cells, item types). One slot; saving overwrites the previous one.
export function useCheckpoint({
  gridSize,
  placements,
  inventory,
  disabledCells,
  itemTypes,
  setGridSize,
  setDisabledCells,
  setItemTypes,
  board,
  clearSelection,
}: {
  gridSize: GridSize;
  placements: Placement[];
  inventory: Inventory;
  disabledCells: Set<string>;
  itemTypes: ItemType[];
  setGridSize: (s: GridSize) => void;
  setDisabledCells: (s: Set<string>) => void;
  setItemTypes: (t: ItemType[]) => void;
  board: BoardActions;
  clearSelection: () => void;
}): {
  onSaveState: () => void;
  onRevert: () => void;
  canRevert: boolean;
} {
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);

  const onSaveState = useCallback(() => {
    setCheckpoint({
      gridSize,
      placements: [...placements],
      inventory: { ...inventory },
      disabledCells: new Set(disabledCells),
      itemTypes: [...itemTypes],
    });
  }, [gridSize, placements, inventory, disabledCells, itemTypes]);

  const onRevert = useCallback(() => {
    if (!checkpoint) return;
    setGridSize(checkpoint.gridSize);
    setDisabledCells(new Set(checkpoint.disabledCells));
    setItemTypes(checkpoint.itemTypes);
    board.applyBoard({ placements: checkpoint.placements, inventory: checkpoint.inventory });
    clearSelection();
  }, [checkpoint, board, clearSelection, setGridSize, setDisabledCells, setItemTypes]);

  return { onSaveState, onRevert, canRevert: checkpoint !== null };
}
