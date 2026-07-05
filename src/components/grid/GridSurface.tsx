import { useCallback, useRef } from "react";
import type { CatalogById, Inventory, Placement, ScoreResult } from "../../model/types";
import { DragGhost } from "./DragGhost";
import { GridBackground } from "./GridBackground";
import { MarqueeRect } from "./MarqueeRect";
import { PlacedItem } from "./PlacedItem";
import { useDragInteractions } from "./useDragInteractions";
import { useTrayGhost, type TrayDrag } from "./useTrayGhost";
import { VizOverlay } from "./VizOverlay";

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

// The grid surface: composes the background, placed items, viz overlay, and
// the pointer interactions (move/marquee via useDragInteractions, tray-drop
// ghosting via useTrayGhost).
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

  const { ghost, moveGhostTo, clearGhost, dropGhost } = useTrayGhost({
    draggingFromTray,
    placements,
    gridW,
    gridH,
    disabledCells,
    typesById,
  });

  const drag = useDragInteractions({
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
  });

  const onSurfacePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingFromTray) return;
    drag.onSurfacePointerDown(e);
  };

  const onSurfacePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingFromTray) {
      const { x, y } = cellAt(e.clientX, e.clientY);
      moveGhostTo(x, y);
      return;
    }
    drag.onSurfacePointerMove(e);
  };

  const onSurfacePointerUp = () => {
    if (draggingFromTray) {
      const drop = dropGhost();
      if (drop) {
        if (drop.placement) {
          setPlacements([...placements, drop.placement]);
          setInventory({
            ...inventory,
            [drop.placement.type]: Math.max(0, (inventory[drop.placement.type] || 0) - 1),
          });
        }
        setDraggingFromTray(null);
        return;
      }
    }
    drag.onSurfacePointerUp();
  };

  return (
    <div
      ref={surfaceRef}
      data-grid-surface=""
      onPointerDown={onSurfacePointerDown}
      onPointerMove={onSurfacePointerMove}
      onPointerUp={onSurfacePointerUp}
      onPointerLeave={() => {
        if (draggingFromTray) clearGhost();
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
          onPointerDown={drag.onItemPointerDown}
          onKeyActivate={pl => setSelectedIds(selectedIds.includes(pl.id) ? [] : [pl.id])}
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
      {ghost && (
        <DragGhost
          ghost={ghost}
          cell={cell}
          gap={gap}
          gridW={gridW}
          gridH={gridH}
          iconStyle={iconStyle}
          typesById={typesById}
        />
      )}

      {/* Marquee */}
      {drag.marquee && <MarqueeRect marquee={drag.marquee} isWarm={isWarm} />}
    </div>
  );
}
