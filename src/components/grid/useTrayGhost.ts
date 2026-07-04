import { useCallback, useEffect, useState } from "react";
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

// Ghost preview while dragging a type out of the tray: follows the pointer,
// re-validates when the pending rotation changes ("R" mid-drag), and mints a
// real placement on a valid drop.
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
  const [ghost, setGhost] = useState<Ghost | null>(null);

  // Re-evaluate the ghost when the tray-drag rotation changes (rotate via "R" while dragging)
  useEffect(() => {
    if (!draggingFromTray) return;
    setGhost(g => {
      if (!g) return g;
      const candidate = {
        id: "__ghost",
        type: draggingFromTray.type,
        x: g.x,
        y: g.y,
        rot: draggingFromTray.rot ?? 0,
      };
      const valid = fits(candidate, placements, gridW, gridH, "__ghost", disabledCells, typesById);
      return { ...candidate, valid };
    });
  }, [draggingFromTray, placements, gridW, gridH, disabledCells, typesById]);

  const moveGhostTo = useCallback(
    (x: number, y: number) => {
      if (!draggingFromTray) return;
      const candidate = {
        id: "__ghost",
        type: draggingFromTray.type,
        x,
        y,
        rot: draggingFromTray.rot ?? 0,
      };
      const valid = fits(candidate, placements, gridW, gridH, "__ghost", disabledCells, typesById);
      setGhost({ ...candidate, valid });
    },
    [draggingFromTray, placements, gridW, gridH, disabledCells, typesById],
  );

  const clearGhost = useCallback(() => setGhost(null), []);

  // Consume the ghost on pointer-up. Returns null when there is no ghost to
  // drop (the caller falls through to its other pointer-up handling); returns
  // { placement: null } for an invalid drop so the caller still ends the drag.
  const dropGhost = useCallback((): { placement: Placement | null } | null => {
    if (!ghost) return null;
    setGhost(null);
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
