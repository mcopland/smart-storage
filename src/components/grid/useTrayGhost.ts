import { useCallback, useMemo, useState } from "react";
import { fits } from "../../model/geometry";
import { newPlacementId } from "../../model/ids";
import type { Placement, TypesById } from "../../model/types";

export interface TrayDrag {
  type: string;
  rot?: number;
}

export interface Ghost extends Placement {
  valid: boolean;
}

// Ghost preview while dragging a type out of the tray. Only the pointer's
// grid position is state; the ghost itself (including validity and the
// pending rotation from "R" mid-drag) is derived, so it can never drift from
// the drag it belongs to.
export function useTrayGhost({
  draggingFromTray,
  placements,
  gridW,
  gridH,
  disabledCells,
  typesById,
}: {
  draggingFromTray: TrayDrag | null;
  placements: Placement[];
  gridW: number;
  gridH: number;
  disabledCells: Set<string>;
  typesById: TypesById;
}): {
  ghost: Ghost | null;
  moveGhostTo: (x: number, y: number) => void;
  clearGhost: () => void;
  dropGhost: () => { placement: Placement | null } | null;
} {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // A fresh drag starts with no position: clear the previous drag's leftover
  // position when draggingFromTray transitions from null to a new drag.
  // (Mid-drag identity changes -- the "R" rotation -- must keep the position.)
  const [prevDrag, setPrevDrag] = useState(draggingFromTray);
  if (prevDrag !== draggingFromTray) {
    setPrevDrag(draggingFromTray);
    if (prevDrag === null) setPos(null);
  }

  const ghost = useMemo<Ghost | null>(() => {
    if (!draggingFromTray || !pos) return null;
    const candidate = {
      id: "__ghost",
      type: draggingFromTray.type,
      x: pos.x,
      y: pos.y,
      rot: draggingFromTray.rot ?? 0,
    };
    const valid = fits(candidate, placements, gridW, gridH, "__ghost", disabledCells, typesById);
    return { ...candidate, valid };
  }, [draggingFromTray, pos, placements, gridW, gridH, disabledCells, typesById]);

  const moveGhostTo = useCallback((x: number, y: number) => setPos({ x, y }), []);

  const clearGhost = useCallback(() => setPos(null), []);

  // Consume the ghost on pointer-up. Returns null when there is no ghost to
  // drop (the caller falls through to its other pointer-up handling); returns
  // { placement: null } for an invalid drop so the caller still ends the drag.
  const dropGhost = useCallback((): { placement: Placement | null } | null => {
    if (!ghost) return null;
    setPos(null);
    if (!ghost.valid) return { placement: null };
    return {
      placement: {
        id: newPlacementId(),
        type: ghost.type,
        x: ghost.x,
        y: ghost.y,
        rot: ghost.rot,
      },
    };
  }, [ghost]);

  return { ghost, moveGhostTo, clearGhost, dropGhost };
}
