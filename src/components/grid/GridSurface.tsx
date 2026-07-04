import { useCallback, useEffect, useRef, useState } from "react";
import { fits, getDims, getShapeCells } from "../../model/geometry";
import { newPlacementId } from "../../model/ids";
import type { CatalogById, Inventory, Placement, ScoreResult } from "../../model/types";
import { Glyph } from "../Glyph";
import { GridBackground } from "./GridBackground";
import { PlacedItem } from "./PlacedItem";
import { glyphBox, pickGlyphCell, shapeOutlinePath } from "./shapeOutline";
import { VizOverlay } from "./VizOverlay";

export interface TrayDrag {
  type: string;
  rot?: number;
}

interface Ghost extends Placement {
  valid: boolean;
}

interface Marquee {
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

export interface GridSurfaceProps {
  placements: Placement[];
  setPlacements: (p: Placement[]) => void;
  inventory: Inventory;
  setInventory: (inv: Inventory) => void;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  gridW: number;
  gridH: number;
  cell: number;
  gap: number;
  vizMode: string;
  theme: string;
  iconStyle: "solid" | "glyph";
  scoreData: ScoreResult | null;
  draggingFromTray: TrayDrag | null;
  setDraggingFromTray: (d: TrayDrag | null) => void;
  disabledCells: Set<string>;
  toggleDisabledCell?: (x: number, y: number) => void;
  highlightedTypeId: string | null;
  hoveredId: string | null;
  onHoverPlacement?: (id: string | null) => void;
  highlightStyle: string;
  typesById: CatalogById;
}

// The grid surface
export function GridSurface({
  placements,
  setPlacements,
  inventory,
  setInventory,
  selectedIds,
  setSelectedIds,
  gridW,
  gridH,
  cell,
  gap,
  vizMode,
  theme,
  iconStyle,
  scoreData,
  draggingFromTray,
  setDraggingFromTray,
  disabledCells,
  toggleDisabledCell,
  highlightedTypeId,
  hoveredId,
  onHoverPlacement,
  highlightStyle,
  typesById,
}: GridSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
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

  const isWarm = theme === "warm";
  // A "focus" is active when something is selected or an inventory type is hovered.
  const focusActive = selectedIds.length > 0 || highlightedTypeId != null || hoveredId != null;
  const totalW = gridW * cell + (gridW - 1) * gap;
  const totalH = gridH * cell + (gridH - 1) * gap;

  const cellAt = useCallback(
    (clientX: number, clientY: number) => {
      const r = surfaceRef.current!.getBoundingClientRect();
      const px = clientX - r.left;
      const py = clientY - r.top;
      return { x: Math.floor(px / (cell + gap)), y: Math.floor(py / (cell + gap)), px, py };
    },
    [cell, gap],
  );

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
    const r = surfaceRef.current!.getBoundingClientRect();
    const startPx = e.clientX - r.left;
    const startPy = e.clientY - r.top;
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
    if (draggingFromTray) return;
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
    if (draggingFromTray) {
      const { x, y } = cellAt(e.clientX, e.clientY);
      const candidate = {
        id: "__ghost",
        type: draggingFromTray.type,
        x,
        y,
        rot: draggingFromTray.rot ?? 0,
      };
      const valid = fits(candidate, placements, gridW, gridH, "__ghost", disabledCells, typesById);
      setGhost({ ...candidate, valid });
      return;
    }
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
      const movingIds = new Set(ids);
      const stationary = proposed.filter(p => !movingIds.has(p.id));
      let ok = true;
      for (const p of proposed.filter(q => movingIds.has(q.id))) {
        if (
          !fits(
            p,
            [...stationary, ...proposed.filter(q => movingIds.has(q.id) && q.id !== p.id)],
            gridW,
            gridH,
            p.id,
            disabledCells,
            typesById,
          )
        ) {
          ok = false;
          break;
        }
      }
      if (ok) setPlacements(proposed);
    }
  };

  const onSurfacePointerUp = () => {
    if (draggingFromTray && ghost) {
      if (ghost.valid) {
        const newPlacement = {
          id: newPlacementId(),
          type: ghost.type,
          x: ghost.x,
          y: ghost.y,
          rot: ghost.rot,
        };
        setPlacements([...placements, newPlacement]);
        setInventory({ ...inventory, [ghost.type]: Math.max(0, (inventory[ghost.type] || 0) - 1) });
      }
      setDraggingFromTray(null);
      setGhost(null);
      return;
    }
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

  const ghostType = ghost ? typesById[ghost.type] : undefined;
  const ghostCells = ghost ? getShapeCells(ghost, typesById) : null;

  return (
    <div
      ref={surfaceRef}
      data-grid-surface=""
      onPointerDown={onSurfacePointerDown}
      onPointerMove={onSurfacePointerMove}
      onPointerUp={onSurfacePointerUp}
      onPointerLeave={() => {
        if (draggingFromTray) setGhost(null);
      }}
      style={{
        position: "relative",
        width: totalW,
        height: totalH,
        margin: "0 auto",
        touchAction: "none",
      }}
    >
      <GridBackground
        gridW={gridW}
        gridH={gridH}
        cell={cell}
        gap={gap}
        disabledCells={disabledCells}
        isWarm={isWarm}
      />

      {/* Placements */}
      {placements.map(p => (
        <PlacedItem
          key={p.id}
          p={p}
          cell={cell}
          gap={gap}
          selected={selectedIds.includes(p.id)}
          score={scoreData?.perItem[p.id]?.total}
          vizMode={vizMode}
          onPointerDown={onItemPointerDown}
          onHoverEnter={pl => onHoverPlacement && onHoverPlacement(pl.id)}
          onHoverLeave={() => onHoverPlacement && onHoverPlacement(null)}
          theme={theme}
          iconStyle={iconStyle}
          highlighted={highlightedTypeId === p.type || hoveredId === p.id}
          highlightStyle={highlightStyle}
          focusActive={focusActive}
          typesById={typesById}
        />
      ))}

      {/* Viz overlay over items */}
      {(vizMode === "edges" || vizMode === "focus" || vizMode === "lines") && (
        <VizOverlay
          placements={placements}
          scoreData={scoreData}
          cell={cell}
          gap={gap}
          gridW={gridW}
          gridH={gridH}
          mode={vizMode}
          theme={theme}
          selectedIds={hoveredId != null ? [...selectedIds, hoveredId] : selectedIds}
          highlightedTypeId={highlightedTypeId}
          typesById={typesById}
        />
      )}

      {/* Ghost from tray */}
      {ghost
        && ghostType
        && ghostCells
        && (() => {
          const [gw, gh] = getDims(ghost, typesById);
          const inBounds = ghostCells.every(
            ([cx, cy]) =>
              ghost.x + cx >= 0
              && ghost.y + cy >= 0
              && ghost.x + cx < gridW
              && ghost.y + cy < gridH,
          );
          if (!inBounds) return null;
          const cellSet = new Set(ghostCells.map(([x, y]) => `${x},${y}`));
          const has = (x: number, y: number) => cellSet.has(`${x},${y}`);
          const [ggx, ggy] = pickGlyphCell(ghostCells);
          return (
            <div
              style={{
                position: "absolute",
                left: ghost.x * (cell + gap),
                top: ghost.y * (cell + gap),
                width: gw * cell + (gw - 1) * gap,
                height: gh * cell + (gh - 1) * gap,
                pointerEvents: "none",
              }}
            >
              <svg
                width={gw * cell + (gw - 1) * gap}
                height={gh * cell + (gh - 1) * gap}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  overflow: "visible",
                  display: "block",
                  opacity: 0.7,
                }}
              >
                <path
                  d={shapeOutlinePath(ghostCells, cell, gap, 6)}
                  fill={
                    ghost.valid
                      ? `color-mix(in oklab, ${ghostType.color} 12%, transparent)`
                      : "rgba(255,80,80,0.05)"
                  }
                  stroke={ghost.valid ? ghostType.color : "oklch(0.7 0.18 25)"}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  strokeLinejoin="round"
                />
              </svg>
              <div
                style={{
                  position: "absolute",
                  ...glyphBox(ggx, ggy, has, cell, gap),
                  padding: cell * 0.15,
                  opacity: 0.4,
                  pointerEvents: "none",
                }}
              >
                <Glyph
                  kind={ghostType.glyph}
                  style={iconStyle}
                  color={ghostType.color}
                  w={1}
                  h={1}
                />
              </div>
            </div>
          );
        })()}

      {/* Marquee */}
      {marquee && (
        <div
          style={{
            position: "absolute",
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
            border: `1px solid ${isWarm ? "rgba(60,50,40,0.4)" : "rgba(255,255,255,0.4)"}`,
            background: isWarm ? "rgba(60,50,40,0.06)" : "rgba(255,255,255,0.05)",
            pointerEvents: "none",
            borderRadius: 2,
          }}
        ></div>
      )}
    </div>
  );
}
