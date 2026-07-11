import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { AppModals } from "./components/AppModals";
import { GridSurface } from "./components/grid/GridSurface";
import type { TrayDrag } from "./components/grid/useTrayGhost";
import { Notice } from "./components/Notice";
import { PannableContainer } from "./components/PannableContainer";
import { GridSizeControls } from "./components/panels/GridSizeControls";
import { ScorePanel } from "./components/panels/ScorePanel";
import { ShortcutsRow } from "./components/panels/ShortcutsRow";
import { Tray } from "./components/panels/Tray";
import { trayMetrics } from "./components/panels/trayMetrics";
import { ZoomSlider } from "./components/panels/ZoomSlider";
import { engineScore } from "./engine/wasm";
import { INITIAL_INVENTORY, INITIAL_PLACEMENTS } from "./model/catalog";
import { findFirstFit, fits } from "./model/geometry";
import { newPlacementId } from "./model/ids";
import type { GridSize, ItemType } from "./model/types";
import { useBoard } from "./useBoard";
import { useCheckpoint } from "./useCheckpoint";
import { useGlobalShortcuts } from "./useGlobalShortcuts";
import { useGridConfig } from "./useGridConfig";
import { useGridSizing } from "./useGridSizing";
import { useItemTypes } from "./useItemTypes";
import { useLayoutIO } from "./useLayoutIO";
import { useNotice } from "./useNotice";
import { useOptimizer } from "./useOptimizer";
import { useSelection } from "./useSelection";
import { useThemeColors } from "./useThemeColors";
import { TWEAK_DEFAULTS, useTweaks } from "./useTweaks";

export function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [gridSize, setGridSize] = useState<GridSize>({ w: 10, h: 10 });
  const [{ placements, inventory }, board] = useBoard({
    placements: INITIAL_PLACEMENTS,
    inventory: INITIAL_INVENTORY,
  });
  const [draggingFromTray, setDraggingFromTray] = useState<TrayDrag | null>(null);
  const [disabledCells, setDisabledCells] = useState<Set<string>>(new Set());
  const [newTypeOpen, setNewTypeOpen] = useState(false);

  const gridW = gridSize.w,
    gridH = gridSize.h;
  const gap = 4;

  const {
    selectedIds,
    setSelectedIds,
    selectedTypeId,
    highlightedTypeId,
    setHighlightedTypeId,
    hoveredId,
    setHoveredId,
    onSelectPlacements,
    onSelectTrayType,
    clearSelection,
  } = useSelection();

  const { notice, showNotice, dismiss } = useNotice();

  const { fg, fgFaint, bg, surface, surfaceSubtle, border } = useThemeColors(t.theme);

  const {
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
  } = useItemTypes({ board, placements, gridW, gridH, disabledCells, clearSelection });

  const { onSafeResizeW, onSafeResizeH, toggleDisabledCell } = useGridConfig({
    placements,
    typeById,
    board,
    gridW,
    gridH,
    setGridSize,
    disabledCells,
    setDisabledCells,
  });

  const { onSaveState, onRevert, canRevert } = useCheckpoint({
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
  });

  // Set the available stock (inventory count) for a type; lets the user restock
  // an object that's fully placed so they can create more instances of it.
  const onSetStock = useCallback(
    (typeId: string, n: number) => {
      if (!typeId) return;
      board.setStock(typeId, n);
    },
    [board],
  );

  // Compute cell size: at zoom=100% the grid fits the container.
  const zoom = t.zoom ?? 100;
  const { containerRef: gridContainerRef, cell, wsPad } = useGridSizing(gridW, gridH, gap, zoom);

  // Scoring lives in the Rust/WASM engine (single source of truth); calls are
  // synchronous and cheap, so the live score recomputes on every change.
  // The try/catch prevents an engine error from crashing the whole app through
  // the ErrorBoundary -- the score panel gracefully shows null instead.
  const scoreData = useMemo(() => {
    try {
      return engineScore({ itemTypes, gridW, gridH, placements });
    } catch (err) {
      console.error("live score failed:", err);
      return null;
    }
  }, [itemTypes, gridW, gridH, placements]);

  useEffect(() => {
    document.body.className = `theme-${t.theme}`;
  }, [t.theme]);

  const rotateSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    board.setPlacements(
      placements.map(p => {
        if (!selectedIds.includes(p.id)) return p;
        const newRot = (p.rot + 90) % 360;
        const candidate = { ...p, rot: newRot };
        if (fits(candidate, placements, gridW, gridH, p.id, disabledCells, typeById))
          return candidate;
        return p;
      }),
    );
  }, [selectedIds, placements, gridW, gridH, disabledCells, typeById, board]);

  const deleteSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    board.removePlacements(selectedIds);
    setSelectedIds([]);
  }, [selectedIds, board, setSelectedIds]);

  useGlobalShortcuts({
    draggingFromTray,
    setDraggingFromTray,
    rotateSelection,
    deleteSelection,
    selectedTypeId,
    onDeleteType: setDeleteTypeTarget,
  });

  const onTrayDragStart = (e: PointerEvent, type: ItemType) => {
    e.preventDefault();
    setDraggingFromTray({ type: type.id, rot: 0 });
  };

  const onAddNew = () => setNewTypeOpen(true);

  // Place a single instance of the currently selected inventory type onto the
  // first free spot it fits (any rotation). Mirrors the per-type half of Place all.
  const onAddItem = useCallback(() => {
    if (!selectedTypeId) return;
    const id = newPlacementId();
    const chosen = findFirstFit(
      selectedTypeId,
      id,
      placements,
      gridW,
      gridH,
      disabledCells,
      typeById,
    );
    if (!chosen) return; // grid is full: nowhere to put it
    // addPlacement consumes one stock if available, otherwise mints (stock stays 0).
    board.addPlacement(chosen);
  }, [selectedTypeId, placements, gridW, gridH, disabledCells, typeById, board]);

  // Place every remaining inventory item onto the first free spot it fits.
  const onPlaceAll = useCallback(() => {
    clearSelection();
    const placed = [...placements];
    const newInv = { ...inventory };
    for (const tt of itemTypes) {
      let count = Math.max(0, newInv[tt.id] ?? 0);
      while (count > 0) {
        const id = newPlacementId();
        const chosen = findFirstFit(tt.id, id, placed, gridW, gridH, disabledCells, typeById);
        if (!chosen) break; // no room left for this type
        placed.push(chosen);
        count -= 1;
      }
      newInv[tt.id] = count;
    }
    board.placeAll(placed, newInv);
  }, [
    placements,
    inventory,
    itemTypes,
    gridW,
    gridH,
    disabledCells,
    typeById,
    board,
    clearSelection,
  ]);

  const { fileInputRef, onImport, onImportFile, onExport } = useLayoutIO(
    {
      gridSize,
      placements,
      disabledCells,
      itemTypes,
      inventory,
      scoreTotal: scoreData?.total ?? 0,
    },
    patch => {
      if (patch.gridSize) setGridSize(patch.gridSize);
      if (patch.disabledCells) setDisabledCells(new Set(patch.disabledCells));
      if (patch.itemTypes) setItemTypes(patch.itemTypes);
      board.applyBoard({ placements: patch.placements, inventory: patch.inventory });
      clearSelection();
      dismiss();
    },
    showNotice,
  );

  // Simulated annealing in the Rust/WASM engine, run in a Web Worker. Each
  // progress chunk applies the best layout found so far, so the board animates
  // toward the result; clicking again while running cancels (the last applied
  // layout stands).
  const {
    optimizing,
    onOptimize,
    onPrevLayout,
    onNextLayout,
    explored,
    stalled,
    bestLayoutCount,
    bestLayouts,
    layoutIndex,
    upperBound,
    provablyOptimal,
  } = useOptimizer({
    placements,
    itemTypes,
    gridW,
    gridH,
    disabledCells,
    // Dismiss any stale error notice when a new run begins.
    onStart: () => {
      dismiss();
      clearSelection();
    },
    onProgress: p => board.setPlacements(p),
    onError: showNotice,
  });

  const isWarm = t.theme === "warm";
  const isRail = t.trayLayout === "rail";
  // Panel width is derived from the inventory tile metrics (see trayMetrics), not a fixed number.
  const trayWidth = trayMetrics(isRail).width;

  const sectionLabel = {
    font: '500 10px/1 "JetBrains Mono", monospace',
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: fgFaint,
  } as const;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "grid",
        gridTemplateRows: "52px 1fr",
        background: bg,
        color: fg,
      }}
    >
      <AppHeader
        t={t}
        setTweak={setTweak}
        fg={fg}
        border={border}
        surface={surface}
        fileInputRef={fileInputRef}
        onImportFile={onImportFile}
      />

      {/* MAIN */}
      <main
        style={{
          display: "grid",
          gridTemplateColumns: `${trayWidth}px minmax(0, 1fr) 320px`,
          height: "100%",
          minHeight: 0,
        }}
      >
        {/* Left tray */}
        <aside
          data-tray-panel=""
          style={{
            borderRight: `1px solid ${border}`,
            background: surfaceSubtle,
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Tray
            inventory={inventory}
            itemTypes={itemTypes}
            selectedTypeId={selectedTypeId}
            onSelectType={onSelectTrayType}
            onStartDrag={onTrayDragStart}
            onAddNew={onAddNew}
            onAddItem={onAddItem}
            onPlaceAll={onPlaceAll}
            theme={t.theme}
            iconStyle={t.iconStyle}
            layout={t.trayLayout}
            highlightedTypeId={highlightedTypeId}
            onHoverTypeId={setHighlightedTypeId}
          />
        </aside>

        {/* Center workspace */}
        <section
          ref={gridContainerRef}
          style={{
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            padding: "14px 32px 32px",
            background: bg,
            minWidth: 0,
          }}
        >
          {/* Workspace label */}
          <div
            style={{
              ...sectionLabel,
              marginBottom: 12,
              flexShrink: 0,
              position: "relative",
              zIndex: 2,
            }}
          >
            Workspace
          </div>

          {/* Grid card: furthest-back layer */}
          <PannableContainer zoom={zoom} theme={t.theme}>
            <div
              style={{
                position: "relative",
                padding: wsPad,
                border: `1px solid ${border}`,
                borderRadius: 12,
                background: surface,
                boxShadow: isWarm
                  ? "0 1px 0 rgba(255,255,255,0.5) inset"
                  : "0 1px 0 rgba(255,255,255,0.03) inset",
              }}
            >
              <GridSurface
                placements={placements}
                setPlacements={board.setPlacements}
                inventory={inventory}
                setInventory={board.setInventory}
                selectedIds={selectedIds}
                setSelectedIds={onSelectPlacements}
                gridW={gridW}
                gridH={gridH}
                cell={cell}
                gap={gap}
                vizMode={t.vizMode}
                theme={t.theme}
                iconStyle={t.iconStyle}
                highlightStyle="dim"
                scoreData={scoreData}
                draggingFromTray={draggingFromTray}
                setDraggingFromTray={setDraggingFromTray}
                disabledCells={disabledCells}
                toggleDisabledCell={toggleDisabledCell}
                highlightedTypeId={highlightedTypeId}
                hoveredId={hoveredId}
                onHoverPlacement={setHoveredId}
                typesById={typeById}
              />
            </div>
          </PannableContainer>

          {/* Bottom controls: grid resize, zoom, shortcuts (layered above the grid) */}
          <div
            style={{
              flexShrink: 0,
              position: "relative",
              zIndex: 2,
              marginTop: 12,
              background: bg,
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
              <GridSizeControls
                gridW={gridW}
                gridH={gridH}
                onChangeW={onSafeResizeW}
                onChangeH={onSafeResizeH}
                theme={t.theme}
              />
              <ZoomSlider value={zoom} onChange={v => setTweak("zoom", v)} theme={t.theme} />
            </div>
            <ShortcutsRow theme={t.theme} />
          </div>
        </section>

        {/* Right panel */}
        <aside
          data-score-panel=""
          style={{
            borderLeft: `1px solid ${border}`,
            background: surfaceSubtle,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <ScorePanel
            scoreData={scoreData}
            placements={placements}
            selectedIds={selectedIds}
            selectedTypeId={selectedTypeId}
            theme={t.theme}
            iconStyle={t.iconStyle}
            optimizing={optimizing}
            explored={explored}
            stalled={stalled}
            upperBound={upperBound}
            provablyOptimal={provablyOptimal}
            bestLayoutCount={bestLayoutCount}
            bestLayouts={bestLayouts}
            layoutIndex={layoutIndex}
            onImport={onImport}
            onExport={onExport}
            onOptimize={onOptimize}
            onPrevLayout={onPrevLayout}
            onNextLayout={onNextLayout}
            onSaveState={onSaveState}
            onRevert={onRevert}
            canRevert={canRevert}
            itemTypes={itemTypes}
            typeById={typeById}
            onUpdateType={onUpdateType}
            onDeleteType={id => setDeleteTypeTarget(id)}
            onEditShape={tt => setShapeEditorTarget(tt)}
            onSelectType={onSelectTrayType}
            highlightedTypeId={highlightedTypeId}
            onHoverTypeId={setHighlightedTypeId}
            inventory={inventory}
            onSetStock={onSetStock}
          />
        </aside>
      </main>

      <AppModals
        theme={t.theme}
        itemTypes={itemTypes}
        typeById={typeById}
        placements={placements}
        newTypeOpen={newTypeOpen}
        setNewTypeOpen={setNewTypeOpen}
        onCreateType={onCreateType}
        deleteTypeTarget={deleteTypeTarget}
        setDeleteTypeTarget={setDeleteTypeTarget}
        confirmDeleteType={confirmDeleteType}
        shapeEditorTarget={shapeEditorTarget}
        setShapeEditorTarget={setShapeEditorTarget}
        onSaveShape={onSaveShape}
        shapeConflict={shapeConflict}
        setShapeConflict={setShapeConflict}
        onResolveShapeConflict={onResolveShapeConflict}
      />
      <Notice notice={notice} theme={t.theme} onDismiss={dismiss} />
    </div>
  );
}
