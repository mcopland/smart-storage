import type { Cell, CatalogById, ItemType, Placement } from "../model/types";
import type { ShapeConflict } from "../useItemTypes";
import { DeleteTypeModal } from "./panels/DeleteTypeModal";
import { NewTypeModal } from "./panels/NewTypeModal";
import { ShapeConflictModal } from "./panels/ShapeConflictModal";
import { ShapeEditorModal } from "./panels/ShapeEditorModal";

// The four item-type modals (create, delete, shape editor, shape conflict),
// gathered so App only wires state to props.
export function AppModals({
  theme,
  itemTypes,
  typeById,
  placements,
  newTypeOpen,
  setNewTypeOpen,
  onCreateType,
  deleteTypeTarget,
  setDeleteTypeTarget,
  confirmDeleteType,
  shapeEditorTarget,
  setShapeEditorTarget,
  onSaveShape,
  shapeConflict,
  setShapeConflict,
  onResolveShapeConflict,
}: {
  theme: string;
  itemTypes: ItemType[];
  typeById: CatalogById;
  placements: Placement[];
  newTypeOpen: boolean;
  setNewTypeOpen: (open: boolean) => void;
  onCreateType: (t: ItemType, count: number) => void;
  deleteTypeTarget: string | null;
  setDeleteTypeTarget: (id: string | null) => void;
  confirmDeleteType: () => void;
  shapeEditorTarget: ItemType | null;
  setShapeEditorTarget: (t: ItemType | null) => void;
  onSaveShape: (typeId: string, cells: Cell[]) => void;
  shapeConflict: ShapeConflict | null;
  setShapeConflict: (c: ShapeConflict | null) => void;
  onResolveShapeConflict: () => void;
}) {
  return (
    <>
      <NewTypeModal
        open={newTypeOpen}
        onClose={() => setNewTypeOpen(false)}
        onCreate={onCreateType}
        theme={theme}
        itemTypes={itemTypes}
      />
      <DeleteTypeModal
        open={!!deleteTypeTarget}
        itemType={deleteTypeTarget ? (typeById[deleteTypeTarget] ?? null) : null}
        placementCount={
          deleteTypeTarget ? placements.filter(p => p.type === deleteTypeTarget).length : 0
        }
        onConfirm={confirmDeleteType}
        onClose={() => setDeleteTypeTarget(null)}
        theme={theme}
      />
      <ShapeEditorModal
        open={!!shapeEditorTarget}
        itemType={shapeEditorTarget}
        onSave={cells => onSaveShape(shapeEditorTarget!.id, cells)}
        onClose={() => setShapeEditorTarget(null)}
        theme={theme}
      />
      <ShapeConflictModal
        open={!!shapeConflict}
        itemType={shapeConflict?.itemType}
        conflictCount={shapeConflict?.conflicts.length || 0}
        onRemoveConflicts={onResolveShapeConflict}
        onClose={() => setShapeConflict(null)}
        theme={theme}
      />
    </>
  );
}
