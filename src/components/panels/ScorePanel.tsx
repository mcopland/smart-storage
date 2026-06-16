import { findClusters } from "../../model/clusters";
import type { CatalogById, Inventory, ItemType, Placement, ScoreResult } from "../../model/types";
import { Glyph } from "../Glyph";
import { BULLET, TIMES } from "./chars";
import { PanelSection } from "./PanelSection";
import { SelectedEditor } from "./SelectedEditor";
import { ACCENT, btnStyle, DANGER } from "./styles";

export interface ScorePanelProps {
  scoreData: ScoreResult | null;
  placements: Placement[];
  selectedIds: string[];
  selectedTypeId: string | null;
  theme: string;
  optimizing: boolean;
  // Layout exploration stats from useOptimizer.
  explored: number;
  coverageBound: string;
  stalled: boolean;
  onImport: () => void;
  onExport: () => void;
  onOptimize: () => void;
  itemTypes: ItemType[];
  typeById: CatalogById;
  onUpdateType: (id: string, patch: Partial<ItemType>) => void;
  onDeleteType?: (id: string) => void;
  onEditShape?: (itemType: ItemType) => void;
  onSelectType?: (id: string) => void;
  highlightedTypeId: string | null;
  onHoverTypeId?: (id: string | null) => void;
  inventory?: Inventory;
  onSetStock?: (typeId: string, n: number) => void;
  iconStyle: "solid" | "glyph";
}

interface PerTypeRow {
  count: number;
  bonus: number;
  color: string;
  name: string;
  glyph: string;
}

export function ScorePanel({
  scoreData,
  placements,
  selectedIds,
  selectedTypeId,
  theme,
  optimizing,
  explored,
  coverageBound,
  stalled,
  onImport,
  onExport,
  onOptimize,
  itemTypes,
  typeById,
  onUpdateType,
  onDeleteType,
  onEditShape,
  onSelectType,
  highlightedTypeId,
  onHoverTypeId,
  inventory,
  onSetStock,
  iconStyle,
}: ScorePanelProps) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgDim = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.5)";
  const fgFaint = isWarm ? "rgba(60,50,40,0.35)" : "rgba(255,255,255,0.32)";
  const border = isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.07)";
  const surfaceSubtle = isWarm ? "#f0ebde" : "rgba(0,0,0,0.18)";

  const total = scoreData?.total ?? 0;
  const perType: Record<string, PerTypeRow> = {};
  for (const p of placements) {
    const tt = typeById[p.type];
    if (!tt) continue;
    perType[p.type] = perType[p.type] || {
      count: 0,
      bonus: 0,
      color: tt.color,
      name: tt.name,
      glyph: tt.glyph,
    };
    perType[p.type].count += 1;
    perType[p.type].bonus += scoreData?.perItem[p.id]?.bonus ?? 0;
  }

  const selectedPlacement =
    selectedIds.length === 1 ? placements.find(p => p.id === selectedIds[0]) : null;
  const editingTypeId = selectedPlacement?.type ?? selectedTypeId;
  const editingType = editingTypeId ? typeById[editingTypeId] : null;
  const selectedDetail = selectedPlacement ? scoreData?.perItem[selectedPlacement.id] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <div style={{ padding: "14px 18px 18px", borderBottom: `1px solid ${border}` }}>
          <div
            style={{
              font: '500 10px/1 "JetBrains Mono", monospace',
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: fgFaint,
              marginBottom: 8,
            }}
          >
            Total Score
          </div>
          <div
            style={{
              font: "300 56px/1 Inter, sans-serif",
              color: fg,
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {total}
          </div>
          <div style={{ marginTop: 8, font: "12px/1.5 Inter, sans-serif", color: fgDim }}>
            {placements.length} {placements.length === 1 ? "item" : "items"} {BULLET}{" "}
            {(() => {
              const c = findClusters(placements, typeById).length;
              return `${c} ${c === 1 ? "cluster" : "clusters"}`;
            })()}
          </div>
        </div>

        <PanelSection label="Composition" theme={theme}>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {Object.entries(perType)
              .sort((a, b) => b[1].bonus - a[1].bonus)
              .map(([id, info]) => {
                const isHl = highlightedTypeId === id;
                const isEditing = editingTypeId === id;
                return (
                  <div
                    key={id}
                    onPointerEnter={() => onHoverTypeId && onHoverTypeId(id)}
                    onPointerLeave={() => onHoverTypeId && onHoverTypeId(null)}
                    onClick={() => onSelectType && onSelectType(id)}
                    title={`Edit ${info.name}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "14px 1fr auto",
                      gap: 10,
                      alignItems: "center",
                      borderRadius: 4,
                      padding: "5px 4px",
                      margin: "0 -4px",
                      background: isHl
                        ? `color-mix(in oklab, ${info.color} 12%, transparent)`
                        : "transparent",
                      boxShadow: isEditing
                        ? `inset 0 0 0 1px color-mix(in oklab, ${info.color} 55%, transparent)`
                        : "none",
                      transition: "background 120ms, box-shadow 120ms",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        filter: isHl
                          ? `drop-shadow(0 0 6px color-mix(in oklab, ${info.color} 50%, transparent))`
                          : "none",
                        transition: "filter 160ms",
                      }}
                    >
                      <Glyph
                        kind={info.glyph}
                        style={iconStyle || "solid"}
                        color={info.color}
                        w={1}
                        h={1}
                      />
                    </div>
                    <div style={{ font: "12px/1 Inter, sans-serif", color: fg }}>
                      {info.name}{" "}
                      <span style={{ color: fgFaint }}>
                        {TIMES}
                        {info.count}
                      </span>
                    </div>
                    <div
                      style={{
                        font: '500 11px/1 "JetBrains Mono", monospace',
                        color: info.bonus >= 0 ? ACCENT : DANGER,
                        fontVariantNumeric: "tabular-nums",
                        width: 32,
                        textAlign: "right",
                      }}
                    >
                      {info.bonus >= 0 ? "+" : ""}
                      {info.bonus}
                    </div>
                  </div>
                );
              })}
          </div>
        </PanelSection>

        {editingType && (
          <PanelSection label={selectedPlacement ? "Edit definition" : "Edit type"} theme={theme}>
            <SelectedEditor
              itemType={editingType}
              detail={selectedDetail}
              theme={theme}
              allTypes={itemTypes}
              onUpdateType={onUpdateType}
              onDeleteType={onDeleteType}
              stock={inventory ? (inventory[editingTypeId!] ?? 0) : undefined}
              onSetStock={onSetStock ? n => onSetStock(editingTypeId!, n) : undefined}
              onEditShape={onEditShape}
            />
          </PanelSection>
        )}
      </div>

      <div
        style={{
          flexShrink: 0,
          borderTop: `1px solid ${border}`,
          background: surfaceSubtle,
          backdropFilter: "blur(8px)",
        }}
      >
        {explored > 0 && (
          <div
            style={{
              padding: "8px 14px 0",
              font: '11px/1.4 "JetBrains Mono", monospace',
              color: fgFaint,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <span>
              {explored.toLocaleString()} of {coverageBound} layouts tried
            </span>
            {stalled && <span style={{ color: fgDim }}>no new layouts found</span>}
          </div>
        )}
        <div
          style={{
            padding: 14,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
          }}
        >
          <button onClick={onImport} style={btnStyle(theme, "ghost")}>
            Import
          </button>
          <button onClick={onExport} style={btnStyle(theme, "ghost")}>
            Export
          </button>
          {/* While solving, the same button cancels the run. */}
          <button onClick={onOptimize} style={btnStyle(theme, "primary")}>
            {optimizing ? "Cancel" : "Optimize"}
          </button>
        </div>
      </div>
    </div>
  );
}
