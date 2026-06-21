import { useCallback, useMemo, useState } from "react";
import { ITEM_TYPES } from "./model/catalog";
import { fits } from "./model/geometry";
import type { Cell, ItemType, Placement } from "./model/types";
import type { BoardActions } from "./useBoard";

export interface ShapeConflict {
  typeId: string;
  newCells: Cell[];
  conflicts: Placement[];
  itemType: ItemType | undefined;
}

export function useItemTypes({
  board,
  placements,
  gridW,
  gridH,
  disabledCells,
  clearSelection,
}: {
  board: BoardActions;
  placements: Placement[];
  gridW: number;
  gridH: number;
  disabledCells: Set<string>;
  clearSelection: () => void;
}) {
  const [itemTypes, setItemTypes] = useState<ItemType[]>(ITEM_TYPES);
  const [shapeConflict, setShapeConflict] = useState<ShapeConflict | null>(null);
  const [shapeEditorTarget, setShapeEditorTarget] = useState<ItemType | null>(null);
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<string | null>(null);

  const typeById = useMemo(
    () => Object.fromEntries(itemTypes.map(tt => [tt.id, tt])) as Record<string, ItemType>,
    [itemTypes],
  );

  const onUpdateType = useCallback((id: string, patch: Partial<ItemType>) => {
    setItemTypes(prev => prev.map(tt => (tt.id === id ? { ...tt, ...patch } : tt)));
  }, []);

  const onCreateType = useCallback(
    (newType: ItemType, count: number) => {
      setItemTypes(prev => [...prev, newType]);
      board.addStock(newType.id, count);
    },
    [board],
  );

  const onSaveShape = useCallback(
    (id: string, newCells: Cell[]) => {
      const affected = placements.filter(p => p.type === id);
      const others = placements.filter(p => p.type !== id);
      const testTypesById = { ...typeById, [id]: { ...typeById[id], cells: newCells } };
      const conflicts = affected.filter(
        p => !fits(p, others, gridW, gridH, p.id, disabledCells, testTypesById),
      );
      if (conflicts.length > 0) {
        setShapeConflict({ typeId: id, newCells, conflicts, itemType: typeById[id] });
        return;
      }
      setItemTypes(prev => prev.map(tt => (tt.id === id ? { ...tt, cells: newCells } : tt)));
    },
    [placements, gridW, gridH, disabledCells, typeById],
  );

  const onResolveShapeConflict = useCallback(() => {
    if (!shapeConflict) return;
    const { typeId, newCells, conflicts } = shapeConflict;
    board.removePlacements(conflicts.map(p => p.id));
    setItemTypes(prev => prev.map(tt => (tt.id === typeId ? { ...tt, cells: newCells } : tt)));
    setShapeConflict(null);
  }, [shapeConflict, board]);

  const confirmDeleteType = useCallback(() => {
    if (!deleteTypeTarget) return;
    board.removeType(deleteTypeTarget);
    setItemTypes(prev => prev.filter(tt => tt.id !== deleteTypeTarget));
    clearSelection();
    setDeleteTypeTarget(null);
  }, [deleteTypeTarget, board, clearSelection]);

  return {
    itemTypes,
    setItemTypes,
    typeById,
    shapeConflict,
    setShapeConflict,
    shapeEditorTarget,
    setShapeEditorTarget,
    deleteTypeTarget,
    setDeleteTypeTarget,
    onUpdateType,
    onCreateType,
    onSaveShape,
    onResolveShapeConflict,
    confirmDeleteType,
  };
}
