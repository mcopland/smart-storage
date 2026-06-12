import { useEffect, useState } from "react";
import type { Cell, ItemType } from "../../model/types";
import { ShapePaintGrid, normalizeCells } from "./ShapePaintGrid";
import { btnStyle } from "./styles";

export interface ShapeEditorModalProps {
  open: boolean;
  itemType: ItemType | null;
  onSave: (cells: Cell[]) => void;
  onClose: () => void;
  theme: string;
}

// Shape Editor Modal (5x5 grid for custom shapes)
export function ShapeEditorModal({
  open,
  itemType,
  onSave,
  onClose,
  theme,
}: ShapeEditorModalProps) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgDim = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.5)";
  const border = isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)";
  const surface = isWarm ? "#fbf8f0" : "#141a23";

  const [cells, setCells] = useState<Cell[]>([]);

  useEffect(() => {
    if (open && itemType) {
      setCells(itemType.cells || [[0, 0]]);
    }
  }, [open, itemType]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !itemType) return null;

  const handleSave = () => {
    if (cells.length === 0) return;
    onSave(normalizeCells(cells));
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 400,
          padding: 22,
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 10,
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <div style={{ font: "600 15px/1.3 Inter, sans-serif", color: fg, marginBottom: 4 }}>
            Edit Shape: {itemType.name}
          </div>
          <div style={{ font: "11.5px/1.4 Inter, sans-serif", color: fgDim }}>
            Click or drag across tiles to paint the shape
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <ShapePaintGrid
            cells={cells}
            onChange={setCells}
            color={itemType.color}
            theme={theme}
            active={open}
          />
        </div>

        <div
          style={{
            padding: "8px 10px",
            marginBottom: 16,
            background: isWarm ? "rgba(60,50,40,0.06)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${border}`,
            borderRadius: 6,
            font: '11px/1.4 "JetBrains Mono", monospace',
            color: fgDim,
          }}
        >
          {cells.length} cell{cells.length === 1 ? "" : "s"} selected
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnStyle(theme, "ghost")}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={cells.length === 0}
            style={{
              ...btnStyle(theme, "primary", cells.length === 0),
              padding: "8px 18px",
            }}
          >
            Save Shape
          </button>
        </div>
      </div>
    </div>
  );
}
