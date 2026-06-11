import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GridSurface, type TrayDrag } from "./components/grid/GridSurface";
import { PannableContainer } from "./components/PannableContainer";
import { DeleteTypeModal } from "./components/panels/DeleteTypeModal";
import { GridSizeControls } from "./components/panels/GridSizeControls";
import { InlineTweaks } from "./components/panels/InlineTweaks";
import { NewTypeModal } from "./components/panels/NewTypeModal";
import { ScorePanel } from "./components/panels/ScorePanel";
import { ShapeConflictModal } from "./components/panels/ShapeConflictModal";
import { ShapeEditorModal } from "./components/panels/ShapeEditorModal";
import { ShortcutsRow } from "./components/panels/ShortcutsRow";
import { Tray } from "./components/panels/Tray";
import { trayMetrics } from "./components/panels/trayMetrics";
import { ZoomSlider } from "./components/panels/ZoomSlider";
import { startOptimizer, type OptimizeHandle } from "./engine/optimizer";
import { engineScore } from "./engine/wasm";
import { INITIAL_INVENTORY, INITIAL_PLACEMENTS, ITEM_TYPES } from "./model/catalog";
import { cellsOf, fits, resizeFit } from "./model/geometry";
import type { Cell, GridSize, Inventory, ItemType, Placement } from "./model/types";
import { TWEAK_DEFAULTS, useTweaks } from "./useTweaks";

interface ShapeConflict {
  typeId: string;
  newCells: Cell[];
  conflicts: Placement[];
  itemType: ItemType | undefined;
}

interface ImportedLayout {
  gridSize?: GridSize;
  placements?: Placement[];
  disabledCells?: string[];
  itemTypes?: ItemType[];
  inventory?: Inventory;
}

// Older exports stored rectangular shapes as `size: [w, h]` instead of `cells`.
// Normalize at the import boundary so the rest of the app only ever sees `cells`.
function normalizeImportedTypes(types: (ItemType & { size?: [number, number] })[]): ItemType[] {
  return types.map(t => {
    if (t.cells && t.cells.length > 0) return t;
    const [w, h] = t.size || [1, 1];
    const cells: Cell[] = [];
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells.push([dx, dy]);
    const { size: _legacySize, ...rest } = t;
    return { ...rest, cells };
  });
}

export function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [gridSize, setGridSize] = useState<GridSize>({ w: 10, h: 10 });
  const [placements, setPlacements] = useState<Placement[]>(INITIAL_PLACEMENTS);
  const [inventory, setInventory] = useState<Inventory>(INITIAL_INVENTORY);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [highlightedTypeId, setHighlightedTypeId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggingFromTray, setDraggingFromTray] = useState<TrayDrag | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [disabledCells, setDisabledCells] = useState<Set<string>>(new Set());
  const [itemTypes, setItemTypes] = useState<ItemType[]>(ITEM_TYPES);
  const [newTypeOpen, setNewTypeOpen] = useState(false);
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<string | null>(null);
  const [shapeEditorTarget, setShapeEditorTarget] = useState<ItemType | null>(null);
  const [shapeConflict, setShapeConflict] = useState<ShapeConflict | null>(null);

  const typeById = useMemo(
    () => Object.fromEntries(itemTypes.map(tt => [tt.id, tt])) as Record<string, ItemType>,
    [itemTypes],
  );

  const gridW = gridSize.w,
    gridH = gridSize.h;
  const gap = 4;

  const onUpdateType = useCallback((id: string, patch: Partial<ItemType>) => {
    setItemTypes(prev => prev.map(tt => (tt.id === id ? { ...tt, ...patch } : tt)));
  }, []);

  const onCreateType = useCallback((newType: ItemType, count: number) => {
    setItemTypes(prev => [...prev, newType]);
    setInventory(prev => ({ ...prev, [newType.id]: (prev[newType.id] ?? 0) + count }));
  }, []);

  // Set the available stock (inventory count) for a type; lets the user restock
  // an object that's fully placed so they can create more instances of it.
  const onSetStock = useCallback((typeId: string, n: number) => {
    if (!typeId) return;
    setInventory(prev => ({ ...prev, [typeId]: Math.max(0, Math.min(999, Math.round(n))) }));
  }, []);

  const onSaveShape = useCallback(
    (id: string, newCells: Cell[]) => {
      // Check if any existing placements of this type would collide with the new shape
      const affected = placements.filter(p => p.type === id);
      const others = placements.filter(p => p.type !== id);

      // Evaluate each affected placement against a registry where this type has the
      // proposed cells, without mutating the real catalog.
      const testTypesById = {
        ...typeById,
        [id]: { ...typeById[id], cells: newCells },
      };
      const conflicts = affected.filter(
        p => !fits(p, others, gridW, gridH, p.id, disabledCells, testTypesById),
      );

      if (conflicts.length > 0) {
        setShapeConflict({
          typeId: id,
          newCells,
          conflicts,
          itemType: typeById[id],
        });
        return;
      }

      setItemTypes(prev => prev.map(tt => (tt.id === id ? { ...tt, cells: newCells } : tt)));
    },
    [placements, gridW, gridH, disabledCells, typeById],
  );

  const onResolveShapeConflict = useCallback(() => {
    if (!shapeConflict) return;
    const { typeId, newCells, conflicts } = shapeConflict;

    // Remove conflicting placements
    const conflictIds = new Set(conflicts.map(p => p.id));
    setPlacements(prev => prev.filter(p => !conflictIds.has(p.id)));

    // Return items to inventory
    const returned: Record<string, number> = {};
    for (const p of conflicts) {
      returned[p.type] = (returned[p.type] || 0) + 1;
    }
    setInventory(prev => {
      const next = { ...prev };
      for (const [type, count] of Object.entries(returned)) {
        next[type] = (next[type] || 0) + count;
      }
      return next;
    });

    // Apply shape change
    setItemTypes(prev => prev.map(tt => (tt.id === typeId ? { ...tt, cells: newCells } : tt)));

    setShapeConflict(null);
  }, [shapeConflict]);

  // Compute cell size: at zoom=100% the grid fits the container.
  const gridContainerRef = useRef<HTMLElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      if (r.width > 0 && r.height > 0) setContainerSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoom = t.zoom ?? 100;
  const wsPad = 18;
  const availW = containerSize.w - 64 - wsPad * 2 - 2;
  const availH = containerSize.h - 64 - wsPad * 2 - 2 - 70 - 42; // extra 42 for controls bar + label
  const baseCell = Math.max(
    12,
    Math.min(
      Math.floor((availW - (gridW - 1) * gap) / gridW),
      Math.floor((availH - (gridH - 1) * gap) / gridH),
    ),
  );
  const cell = Math.round(baseCell * (zoom / 100));

  // Scoring lives in the Rust/WASM engine (single source of truth); calls are
  // synchronous and cheap, so the live score recomputes on every change.
  const scoreData = useMemo(
    () => engineScore({ itemTypes, gridW, gridH, placements }),
    [itemTypes, gridW, gridH, placements],
  );

  useEffect(() => {
    document.body.className = `theme-${t.theme}`;
  }, [t.theme]);

  // Select/deselect handlers
  const onSelectPlacements = useCallback((ids: string[]) => {
    setSelectedIds(ids);
    if (ids.length > 0) setSelectedTypeId(null);
  }, []);
  const onSelectTrayType = useCallback((id: string) => {
    setSelectedTypeId(prev => (prev === id ? null : id));
    setSelectedIds([]);
  }, []);

  // Global click handler: deselect inventory type when clicking outside tray items.
  // The right-hand panel (Composition rows + the editor itself) is exempt, so
  // clicking a Composition row to open the editor, or clicking inside the editor,
  // doesn't immediately clear the selection.
  useEffect(() => {
    if (!selectedTypeId) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest("[data-tray-item]")) return;
      if (target.closest("[data-tray-panel]")) return;
      if (target.closest("[data-score-panel]")) return;
      setSelectedTypeId(null);
    };
    const timer = setTimeout(() => document.addEventListener("click", onClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", onClick);
    };
  }, [selectedTypeId]);

  // Global click handler: deselect workspace placements when clicking off the grid.
  // Mirrors the inventory behaviour: click anywhere outside the grid (or the editor
  // panel that lets you edit the selection) to deselect.
  useEffect(() => {
    if (selectedIds.length === 0) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest("[data-grid-surface]")) return;
      if (target.closest("[data-score-panel]")) return;
      setSelectedIds([]);
    };
    const timer = setTimeout(() => document.addEventListener("click", onClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", onClick);
    };
  }, [selectedIds]);

  // Safe grid resize: compacts placements toward the shrinking edge so empty
  // space on either side can be reclaimed; only blocks if the occupied span
  // genuinely can't fit the requested size.
  const onSafeResizeW = useCallback(
    (newW: number) => {
      const w = Math.max(2, Math.min(20, newW));
      const res = resizeFit(placements, disabledCells, w, gridH, typeById);
      if (!res) return;
      setPlacements(res.placements);
      setDisabledCells(res.disabled);
      setGridSize(prev => ({ ...prev, w }));
    },
    [placements, disabledCells, gridH, typeById],
  );

  const onSafeResizeH = useCallback(
    (newH: number) => {
      const h = Math.max(2, Math.min(20, newH));
      const res = resizeFit(placements, disabledCells, gridW, h, typeById);
      if (!res) return;
      setPlacements(res.placements);
      setDisabledCells(res.disabled);
      setGridSize(prev => ({ ...prev, h }));
    },
    [placements, disabledCells, gridW, typeById],
  );

  const toggleDisabledCell = (cx: number, cy: number) => {
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
  };

  const rotateSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    setPlacements(prev =>
      prev.map(p => {
        if (!selectedIds.includes(p.id)) return p;
        const newRot = (p.rot + 90) % 360;
        const candidate = { ...p, rot: newRot };
        if (fits(candidate, prev, gridW, gridH, p.id, disabledCells, typeById)) return candidate;
        return p;
      }),
    );
  }, [selectedIds, gridW, gridH, disabledCells, typeById]);

  const deleteSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    const removed = placements.filter(p => selectedIds.includes(p.id));
    setPlacements(placements.filter(p => !selectedIds.includes(p.id)));
    const newInv = { ...inventory };
    for (const p of removed) newInv[p.type] = (newInv[p.type] || 0) + 1;
    setInventory(newInv);
    setSelectedIds([]);
  }, [selectedIds, placements, inventory]);

  const confirmDeleteType = useCallback(() => {
    if (!deleteTypeTarget) return;
    const typeId = deleteTypeTarget;
    setPlacements(prev => prev.filter(p => p.type !== typeId));
    setInventory(prev => {
      const next = { ...prev };
      delete next[typeId];
      return next;
    });
    setItemTypes(prev => prev.filter(tt => tt.id !== typeId));
    setSelectedTypeId(null);
    setDeleteTypeTarget(null);
  }, [deleteTypeTarget]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as Element;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        if (draggingFromTray) {
          setDraggingFromTray(d => (d ? { ...d, rot: ((d.rot ?? 0) + 90) % 360 } : d));
        } else {
          rotateSelection();
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedTypeId) {
          setDeleteTypeTarget(selectedTypeId);
        } else {
          deleteSelection();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rotateSelection, deleteSelection, draggingFromTray, selectedTypeId]);

  const onTrayDragStart = (e: PointerEvent, type: ItemType) => {
    e.preventDefault();
    setDraggingFromTray({ type: type.id, rot: 0 });
  };

  const onAddNew = () => setNewTypeOpen(true);

  // Place a single instance of the currently selected inventory type onto the
  // first free spot it fits (any rotation). Mirrors the per-type half of Place all.
  const onAddItem = useCallback(() => {
    if (!selectedTypeId) return;
    let chosen: Placement | null = null;
    outer: for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        for (const rot of [0, 90, 180, 270]) {
          const tryP = {
            id: "ai" + Date.now() + Math.floor(Math.random() * 999),
            type: selectedTypeId,
            x,
            y,
            rot,
          };
          if (fits(tryP, placements, gridW, gridH, tryP.id, disabledCells, typeById)) {
            chosen = tryP;
            break outer;
          }
        }
      }
    }
    if (!chosen) return; // grid is full: nowhere to put it
    setPlacements([...placements, chosen]);
    // If there's stock available, consume one. If the object is fully placed
    // (stock 0), Add still works: it mints a new instance, so the total count
    // of this object grows and stock stays at 0 (created + immediately placed).
    const cur = inventory[selectedTypeId] ?? 0;
    if (cur > 0) setInventory({ ...inventory, [selectedTypeId]: cur - 1 });
  }, [selectedTypeId, inventory, placements, gridW, gridH, disabledCells, typeById]);

  // Place every remaining inventory item onto the first free spot it fits.
  const onPlaceAll = useCallback(() => {
    setSelectedIds([]);
    setSelectedTypeId(null);
    const placed = [...placements];
    const newInv = { ...inventory };
    let n = 0;
    for (const tt of itemTypes) {
      let count = Math.max(0, newInv[tt.id] ?? 0);
      while (count > 0) {
        let chosen: Placement | null = null;
        outer: for (let y = 0; y < gridH; y++) {
          for (let x = 0; x < gridW; x++) {
            for (const rot of [0, 90, 180, 270]) {
              const tryP = { id: "pa" + Date.now() + "_" + n++, type: tt.id, x, y, rot };
              if (fits(tryP, placed, gridW, gridH, tryP.id, disabledCells, typeById)) {
                chosen = tryP;
                break outer;
              }
            }
          }
        }
        if (!chosen) break; // no room left for this type
        placed.push(chosen);
        count -= 1;
      }
      newInv[tt.id] = count;
    }
    setPlacements(placed);
    setInventory(newInv);
  }, [placements, inventory, itemTypes, gridW, gridH, disabledCells, typeById]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const onImport = () => fileInputRef.current?.click();
  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as ImportedLayout;
        if (data.gridSize) setGridSize(data.gridSize);
        if (Array.isArray(data.placements)) setPlacements(data.placements);
        if (Array.isArray(data.disabledCells)) setDisabledCells(new Set(data.disabledCells));
        if (Array.isArray(data.itemTypes)) setItemTypes(normalizeImportedTypes(data.itemTypes));
        if (data.inventory) setInventory(data.inventory);
        setSelectedIds([]);
        setSelectedTypeId(null);
      } catch (err) {
        console.error(`Import failed for "${file.name}":`, err);
        alert(`Could not parse layout file "${file.name}".`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const onExport = () => {
    const data = {
      gridSize,
      placements,
      disabledCells: Array.from(disabledCells),
      itemTypes,
      inventory,
      score: scoreData.total,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "layout.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Simulated annealing in the Rust/WASM engine, run in a Web Worker. Each
  // progress chunk applies the best layout found so far, so the board animates
  // toward the result; clicking again while running cancels (the last applied
  // layout stands).
  const optimizeHandleRef = useRef<OptimizeHandle | null>(null);
  const onOptimize = () => {
    if (optimizing) {
      optimizeHandleRef.current?.cancel();
      optimizeHandleRef.current = null;
      setOptimizing(false);
      return;
    }
    if (placements.length === 0) return;
    setOptimizing(true);
    setSelectedIds([]);
    setSelectedTypeId(null);
    optimizeHandleRef.current = startOptimizer(
      { itemTypes, gridW, gridH, disabledCells: Array.from(disabledCells), placements },
      { seed: Date.now() >>> 0, totalIters: 200_000, chunkIters: 5_000, chunkDelayMs: 30 },
      progress => {
        setPlacements(progress.placements);
        if (progress.done) {
          optimizeHandleRef.current = null;
          setOptimizing(false);
        }
      },
      message => {
        console.error(`Optimize failed: ${message}`);
        optimizeHandleRef.current = null;
        setOptimizing(false);
      },
    );
  };

  const isWarm = t.theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgFaint = isWarm ? "rgba(60,50,40,0.35)" : "rgba(255,255,255,0.3)";
  const bg = isWarm ? "#f5f1e8" : "#0e1116";
  const surface = isWarm ? "#fbf8f0" : "#141a23";
  const surfaceSubtle = isWarm ? "#f0ebde" : "#0d121a";
  const border = isWarm ? "rgba(60,50,40,0.1)" : "rgba(255,255,255,0.06)";

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
      {/* Header: logo + theme/viz toggles only */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          borderBottom: `1px solid ${border}`,
          background: surface,
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 22,
              height: 22,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gridTemplateRows: "1fr 1fr",
              gap: 2,
            }}
          >
            <div style={{ background: "oklch(0.78 0.12 195)", borderRadius: 1.5 }}></div>
            <div style={{ background: "oklch(0.82 0.10 240)", borderRadius: 1.5 }}></div>
            <div style={{ background: "oklch(0.86 0.16 110)", borderRadius: 1.5 }}></div>
            <div style={{ background: "oklch(0.78 0.13 25)", borderRadius: 1.5 }}></div>
          </div>
          <div className="logo" style={{ color: fg }}>
            <span className="l-name">Smart Storage</span>
          </div>
        </div>

        <div style={{ flex: 1 }}></div>

        <InlineTweaks t={t} setTweak={setTweak} theme={t.theme} />

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={onImportFile}
          style={{ display: "none" }}
        />
      </header>

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
                setPlacements={setPlacements}
                inventory={inventory}
                setInventory={setInventory}
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
                onHoverTypeId={setHighlightedTypeId}
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
            onImport={onImport}
            onExport={onExport}
            onOptimize={onOptimize}
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

      <NewTypeModal
        open={newTypeOpen}
        onClose={() => setNewTypeOpen(false)}
        onCreate={onCreateType}
        theme={t.theme}
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
        theme={t.theme}
      />
      <ShapeEditorModal
        open={!!shapeEditorTarget}
        itemType={shapeEditorTarget}
        onSave={cells => onSaveShape(shapeEditorTarget!.id, cells)}
        onClose={() => setShapeEditorTarget(null)}
        theme={t.theme}
      />
      <ShapeConflictModal
        open={!!shapeConflict}
        itemType={shapeConflict?.itemType}
        conflictCount={shapeConflict?.conflicts.length || 0}
        onRemoveConflicts={onResolveShapeConflict}
        onClose={() => setShapeConflict(null)}
        theme={t.theme}
      />
    </div>
  );
}
