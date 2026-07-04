import { useRef, useState } from "react";
import { fits, getDims } from "../../model/geometry";
import type { Placement, TypesById } from "../../model/types";

export interface Marquee {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type DragState =
  | {
      kind: "move";
      ids: string[];
      origPositions: Record<string, { x: number; y: number }>;
      anchor: { x: number; y: number };
      startPx: number;
      startPy: number;
      pointerId: number;
      moved: boolean;
      wasAlreadySelected: boolean;
      clickedId: string;
    }
  | {
      kind: "marquee";
      startPx: number;
      startPy: number;
      pointerId: number;
      additive: boolean;
      origSelection: string[];
    };

// The move and marquee pointer state machines for the grid surface. Tray-drop
// ghosting is handled separately (useTrayGhost); the surface component routes
// pointer events here only when no tray drag is active.
export function useDragInteractions({
  surfaceRef,
  cellAt,
  placements,
  setPlacements,
  selectedIds,
  setSelectedIds,
  cell,
  gap,
  gridW,
  gridH,
  disabledCells,
  toggleDisabledCell,
  typesById,
}: {
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  cellAt: (clientX: number, clientY: number) => { x: number; y: number; px: number; py: number };
  placements: Placement[];
  setPlacements: (p: Placement[]) => void;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  cell: number;
  gap: number;
  gridW: number;
  gridH: number;
  disabledCells: Set<string>;
  toggleDisabledCell?: (x: number, y: number) => void;
  typesById: TypesById;
}): {
  marquee: Marquee | null;
  onItemPointerDown: (e: React.PointerEvent, p: Placement) => void;
  onSurfacePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSurfacePointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSurfacePointerUp: () => void;
} {
  const dragState = useRef<DragState | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);

  // Start dragging an existing placement; stores whether it was already selected for toggle-deselect.
  const onItemPointerDown = (e: React.PointerEvent, p: Placement) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);

    const wasAlreadySelected = selectedIds.includes(p.id);
    let idsToMove;
    if (wasAlreadySelected) {
      idsToMove = selectedIds;
    } else {
      idsToMove = [p.id];
      setSelectedIds([p.id]);
    }
    const { px: startPx, py: startPy } = cellAt(e.clientX, e.clientY);
    const moving = placements.filter(q => idsToMove.includes(q.id));
    dragState.current = {
      kind: "move",
      ids: idsToMove,
      origPositions: Object.fromEntries(moving.map(q => [q.id, { x: q.x, y: q.y }])),
      anchor: { x: p.x, y: p.y },
      startPx,
      startPy,
      pointerId: e.pointerId,
      moved: false,
      wasAlreadySelected,
      clickedId: p.id,
    };
  };

  const onSurfacePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Check if panning is active via data attribute set by PannableContainer
    if ((e.currentTarget as Element).closest('[data-panning="true"]')) return;

    const target = e.target as HTMLElement;
    if (
      target !== e.currentTarget
      && target.tagName !== "svg"
      && !target.classList?.contains("grid-bg")
    )
      return;
    if (e.altKey && target.classList?.contains("grid-bg") && target.dataset.cellX != null) {
      const cx = parseInt(target.dataset.cellX, 10);
      const cy = parseInt(target.dataset.cellY!, 10);
      toggleDisabledCell?.(cx, cy);
      return;
    }
    surfaceRef.current!.setPointerCapture(e.pointerId);
    const { px, py } = cellAt(e.clientX, e.clientY);
    dragState.current = {
      kind: "marquee",
      startPx: px,
      startPy: py,
      pointerId: e.pointerId,
      additive: e.shiftKey,
      origSelection: e.shiftKey ? [...selectedIds] : [],
    };
    setMarquee({ x0: px, y0: py, x1: px, y1: py });
    if (!e.shiftKey) setSelectedIds([]);
  };

  const onSurfacePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    if (dragState.current.kind === "marquee") {
      const { px, py } = cellAt(e.clientX, e.clientY);
      const m = { x0: dragState.current.startPx, y0: dragState.current.startPy, x1: px, y1: py };
      setMarquee(m);
      const xa = Math.min(m.x0, m.x1),
        xb = Math.max(m.x0, m.x1);
      const ya = Math.min(m.y0, m.y1),
        yb = Math.max(m.y0, m.y1);
      const hits = placements
        .filter(p => {
          const [w, h] = getDims(p, typesById);
          const left = p.x * (cell + gap),
            top = p.y * (cell + gap);
          const right = left + w * cell + (w - 1) * gap,
            bottom = top + h * cell + (h - 1) * gap;
          return !(right < xa || left > xb || bottom < ya || top > yb);
        })
        .map(p => p.id);
      const next = dragState.current.additive
        ? Array.from(new Set([...dragState.current.origSelection, ...hits]))
        : hits;
      setSelectedIds(next);
      return;
    }
    if (dragState.current.kind === "move") {
      const { startPx, startPy, ids, origPositions } = dragState.current;
      const { px, py } = cellAt(e.clientX, e.clientY);
      const dx = Math.round((px - startPx) / (cell + gap));
      const dy = Math.round((py - startPy) / (cell + gap));
      if (dx === 0 && dy === 0 && !dragState.current.moved) return;
      dragState.current.moved = true;
      const proposed = placements.map(p => {
        if (!ids.includes(p.id)) return p;
        const orig = origPositions[p.id];
        return { ...p, x: orig.x + dx, y: orig.y + dy };
      });
      // Each moving piece is validated against every other proposed piece;
      // fits() with ignoreId excludes exactly the piece under test.
      const movingIds = new Set(ids);
      const ok = proposed.every(
        p =>
          !movingIds.has(p.id) || fits(p, proposed, gridW, gridH, p.id, disabledCells, typesById),
      );
      if (ok) setPlacements(proposed);
    }
  };

  const onSurfacePointerUp = () => {
    // Toggle-deselect: click on already-selected item without dragging
    if (
      dragState.current?.kind === "move"
      && !dragState.current.moved
      && dragState.current.wasAlreadySelected
    ) {
      if (dragState.current.ids.length === 1) {
        setSelectedIds([]);
      } else {
        // Multi-selection: narrow to just the clicked item
        setSelectedIds([dragState.current.clickedId]);
      }
    }
    // Deselect after an actual drag; the object is highlighted while moving but
    // shouldn't stay selected once dropped.
    if (dragState.current?.kind === "move" && dragState.current.moved) {
      setSelectedIds([]);
    }
    if (dragState.current?.kind === "marquee") {
      setMarquee(null);
    }
    dragState.current = null;
  };

  return {
    marquee,
    onItemPointerDown,
    onSurfacePointerDown,
    onSurfacePointerMove,
    onSurfacePointerUp,
  };
}
