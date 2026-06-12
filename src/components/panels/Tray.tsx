import { useRef } from "react";
import { canCreateNewObject, MAX_OBJECT_TYPES } from "../../model/catalog";
import { getTypeSize } from "../../model/geometry";
import type { Inventory, ItemType } from "../../model/types";
import { Glyph } from "../Glyph";
import { ACCENT } from "./styles";
import { trayMetrics } from "./trayMetrics";

import { EM_DASH as U_DASH, MIDDLE_DOT as U_DOT, TIMES as U_TIMES } from "./chars";

export interface TrayProps {
  inventory: Inventory;
  itemTypes: ItemType[];
  selectedTypeId: string | null;
  onSelectType: (id: string) => void;
  onStartDrag: (e: PointerEvent, type: ItemType) => void;
  onAddNew: () => void;
  onAddItem: () => void;
  onPlaceAll?: () => void;
  theme: string;
  iconStyle: "solid" | "glyph";
  layout: string;
  highlightedTypeId: string | null;
  onHoverTypeId?: (id: string | null) => void;
}

interface TrayDragState {
  id: string;
  startX: number;
  startY: number;
  started: boolean;
  type: ItemType;
  canDrag: boolean;
}

// Tray (drawer / rail)
export function Tray({
  inventory,
  itemTypes,
  selectedTypeId,
  onSelectType,
  onStartDrag,
  onAddNew,
  onAddItem,
  onPlaceAll,
  theme,
  iconStyle,
  layout,
  highlightedTypeId,
  onHoverTypeId,
}: TrayProps) {
  const isWarm = theme === "warm";
  const isRail = layout === "rail";
  const cellBorder = isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.08)";
  const cellBg = isWarm ? "rgba(255,253,247,0.5)" : "rgba(255,255,255,0.02)";
  const m = trayMetrics(isRail);
  const { tileSize, gap, cols } = m;
  const accent = ACCENT;

  const dragRef = useRef<TrayDragState | null>(null);
  // `canDrag` gates only the drag-to-place gesture (needs stock). A click always
  // selects the type so an out-of-stock object can still be picked to edit it or
  // restock it from the panel.
  const startInteract = (e: React.PointerEvent, type: ItemType, canDrag: boolean) => {
    e.preventDefault();
    dragRef.current = {
      id: type.id,
      startX: e.clientX,
      startY: e.clientY,
      started: false,
      type,
      canDrag,
    };
    const onMove = (mv: PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.started || !d.canDrag) return;
      const dx = mv.clientX - d.startX,
        dy = mv.clientY - d.startY;
      if (dx * dx + dy * dy > 16) {
        d.started = true;
        cleanup();
        onStartDrag(mv, d.type);
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      cleanup();
      if (d && !d.started) onSelectType(d.id);
      dragRef.current = null;
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          scrollbarGutter: "stable",
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, ${tileSize}px)`,
          gap: gap,
          justifyContent: "start",
          alignContent: "flex-start",
          padding: m.padCss,
        }}
      >
        {!isRail && (
          <div
            style={{
              gridColumn: "1 / -1",
              font: '500 10px/1 "JetBrains Mono", monospace',
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: isWarm ? "rgba(60,50,40,0.5)" : "rgba(255,255,255,0.4)",
              marginBottom: 6,
            }}
          >
            Inventory
          </div>
        )}
        {itemTypes.map(tt => {
          const count = inventory[tt.id] ?? 0;
          const disabled = count <= 0;
          const [w, h] = getTypeSize(tt);
          const isSel = selectedTypeId === tt.id;
          const numCells = tt.cells ? tt.cells.length : w * h;
          return (
            <div
              key={tt.id}
              data-tray-item={tt.id}
              onPointerDown={e => startInteract(e, tt, !disabled)}
              onPointerEnter={() => {
                if (onHoverTypeId) onHoverTypeId(tt.id);
              }}
              onPointerLeave={() => {
                if (onHoverTypeId) onHoverTypeId(null);
              }}
              title={`${tt.name} ${U_DASH} ${numCells} cells${tt.tags && tt.tags.length ? ` ${U_DOT} ${tt.tags.join(", ")}` : ""}${disabled ? ` ${U_DOT} out of stock (click to edit / restock)` : ""}`}
              style={{
                position: "relative",
                width: tileSize,
                height: tileSize,
                border: `1px solid ${isSel ? accent : cellBorder}`,
                boxShadow: isSel
                  ? `0 0 0 1px ${accent}`
                  : highlightedTypeId === tt.id
                    ? `0 0 10px 3px color-mix(in oklab, ${tt.color} 27%, transparent)`
                    : "none",
                borderRadius: 8,
                background: isSel
                  ? isWarm
                    ? "rgba(94,234,212,0.08)"
                    : "rgba(94,234,212,0.06)"
                  : cellBg,
                padding: "8px 10px 18px",
                cursor: disabled ? "pointer" : "grab",
                opacity: disabled ? 0.5 : 1,
                touchAction: "none",
                transition: "border-color 120ms, box-shadow 120ms, background 120ms, opacity 120ms",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onPointerOver={e => {
                if (!isSel) e.currentTarget.style.borderColor = tt.color;
              }}
              onPointerOut={e => {
                if (!isSel) e.currentTarget.style.borderColor = cellBorder;
              }}
            >
              <div style={{ width: 32, height: 32 }}>
                <Glyph kind={tt.glyph} style={iconStyle} color={tt.color} w={1} h={1} />
              </div>
              <div
                style={{
                  position: "absolute",
                  top: 4,
                  right: 6,
                  font: '500 9px/1 "JetBrains Mono", monospace',
                  color: isWarm ? "rgba(60,50,40,0.65)" : "rgba(255,255,255,0.6)",
                }}
              >
                {U_TIMES}
                {count}
              </div>
              <div
                style={{
                  position: "absolute",
                  bottom: 4,
                  left: 6,
                  right: 6,
                  font: "500 9px/1 Inter, sans-serif",
                  color: isWarm ? "rgba(60,50,40,0.75)" : "rgba(255,255,255,0.7)",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={tt.name}
              >
                {tt.name}
              </div>
            </div>
          );
        })}

        {canCreateNewObject(itemTypes) ? (
          <button
            onClick={onAddNew}
            title="Define new object type"
            style={{
              width: tileSize,
              height: tileSize,
              border: `1px dashed ${isWarm ? "rgba(60,50,40,0.25)" : "rgba(255,255,255,0.18)"}`,
              borderRadius: 8,
              background: "transparent",
              color: isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.45)",
              font: "300 28px/1 Inter, sans-serif",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "border-color 120ms, color 120ms",
            }}
            onPointerEnter={e => {
              e.currentTarget.style.borderColor = ACCENT;
              e.currentTarget.style.color = ACCENT;
            }}
            onPointerLeave={e => {
              e.currentTarget.style.borderColor = isWarm
                ? "rgba(60,50,40,0.25)"
                : "rgba(255,255,255,0.18)";
              e.currentTarget.style.color = isWarm
                ? "rgba(60,50,40,0.55)"
                : "rgba(255,255,255,0.45)";
            }}
          >
            +
          </button>
        ) : (
          <div
            title={`Maximum ${MAX_OBJECT_TYPES} object types reached`}
            style={{
              width: tileSize,
              height: tileSize,
              border: `1px dashed ${isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 8,
              background: "transparent",
              color: isWarm ? "rgba(60,50,40,0.25)" : "rgba(255,255,255,0.2)",
              font: "300 28px/1 Inter, sans-serif",
              cursor: "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.5,
            }}
          >
            +
          </div>
        )}
      </div>

      {onPlaceAll
        && (() => {
          const remaining = itemTypes.reduce((s, tt) => s + Math.max(0, inventory[tt.id] ?? 0), 0);
          const disabled = remaining <= 0;
          const fBorder = isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.07)";
          const selType = selectedTypeId ? itemTypes.find(tt => tt.id === selectedTypeId) : null;
          const addStock = selType ? Math.max(0, inventory[selType.id] ?? 0) : 0;
          // Add only requires a selected object: when stock is 0 it mints a new one,
          // so the button keeps working for continuous adding.
          const addDisabled = !selType;
          const minting = !!selType && addStock <= 0;
          return (
            <div
              style={{
                flexShrink: 0,
                padding: isRail ? "10px 8px" : "12px 16px",
                borderTop: `1px solid ${fBorder}`,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <button
                onClick={onAddItem}
                disabled={addDisabled}
                title={
                  addDisabled
                    ? "Select an inventory object first"
                    : minting
                      ? `Create and place another ${selType!.name}`
                      : `Place one ${selType!.name} on the workspace`
                }
                style={{
                  width: "100%",
                  padding: isRail ? "8px 4px" : "9px 12px",
                  background: addDisabled
                    ? "transparent"
                    : isWarm
                      ? "rgba(94,234,212,0.1)"
                      : "rgba(94,234,212,0.08)",
                  border: `1px solid ${addDisabled ? fBorder : accent}`,
                  borderRadius: 6,
                  cursor: addDisabled ? "not-allowed" : "pointer",
                  color: addDisabled
                    ? isWarm
                      ? "rgba(60,50,40,0.3)"
                      : "rgba(255,255,255,0.25)"
                    : accent,
                  font: isRail
                    ? '500 9px/1.2 "JetBrains Mono", monospace'
                    : "500 12px/1 Inter, sans-serif",
                  letterSpacing: isRail ? "0.04em" : "0.01em",
                  transition: "background 120ms, border-color 120ms",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                onPointerEnter={e => {
                  if (!addDisabled)
                    e.currentTarget.style.background = isWarm
                      ? "rgba(94,234,212,0.18)"
                      : "rgba(94,234,212,0.14)";
                }}
                onPointerLeave={e => {
                  if (!addDisabled)
                    e.currentTarget.style.background = isWarm
                      ? "rgba(94,234,212,0.1)"
                      : "rgba(94,234,212,0.08)";
                }}
              >
                {isRail
                  ? "Add"
                  : selType
                    ? minting
                      ? `Add ${selType.name} +`
                      : `Add ${selType.name}`
                    : "Add Item"}
              </button>
              <button
                onClick={onPlaceAll}
                disabled={disabled}
                title={
                  disabled ? "Inventory is empty" : "Place all inventory items onto the workspace"
                }
                style={{
                  width: "100%",
                  padding: isRail ? "8px 4px" : "9px 12px",
                  background: disabled
                    ? "transparent"
                    : isWarm
                      ? "rgba(94,234,212,0.1)"
                      : "rgba(94,234,212,0.08)",
                  border: `1px solid ${disabled ? fBorder : accent}`,
                  borderRadius: 6,
                  cursor: disabled ? "not-allowed" : "pointer",
                  color: disabled
                    ? isWarm
                      ? "rgba(60,50,40,0.3)"
                      : "rgba(255,255,255,0.25)"
                    : accent,
                  font: isRail
                    ? '500 9px/1.2 "JetBrains Mono", monospace'
                    : "500 12px/1 Inter, sans-serif",
                  letterSpacing: isRail ? "0.04em" : "0.01em",
                  transition: "background 120ms, border-color 120ms",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                onPointerEnter={e => {
                  if (!disabled)
                    e.currentTarget.style.background = isWarm
                      ? "rgba(94,234,212,0.18)"
                      : "rgba(94,234,212,0.14)";
                }}
                onPointerLeave={e => {
                  if (!disabled)
                    e.currentTarget.style.background = isWarm
                      ? "rgba(94,234,212,0.1)"
                      : "rgba(94,234,212,0.08)";
                }}
              >
                {isRail ? "Place" : `Place All${remaining > 0 ? ` (${remaining})` : ""}`}
              </button>
            </div>
          );
        })()}
    </div>
  );
}
