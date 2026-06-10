import { useEffect } from "react";
import type { ItemType } from "../../model/types";
import { Glyph } from "../Glyph";
import { btnStyle } from "./styles";

export interface ShapeConflictModalProps {
  open: boolean;
  itemType: ItemType | null | undefined;
  conflictCount: number;
  onRemoveConflicts: () => void;
  onClose: () => void;
  theme: string;
}

// Shape Conflict Modal
export function ShapeConflictModal({
  open,
  itemType,
  conflictCount,
  onRemoveConflicts,
  onClose,
  theme,
}: ShapeConflictModalProps) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgDim = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.5)";
  const border = isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)";
  const surface = isWarm ? "#fbf8f0" : "#141a23";
  const warningColor = "oklch(0.78 0.13 60)";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !itemType) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1001,
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
          width: 380,
          padding: 22,
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 10,
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, flexShrink: 0 }}>
            <Glyph kind={itemType.glyph} style="solid" color={itemType.color} w={1} h={1} />
          </div>
          <div>
            <div style={{ font: "600 14px/1.3 Inter, sans-serif", color: fg }}>
              Shape Change Conflict
            </div>
            <div style={{ font: "12px/1.4 Inter, sans-serif", color: fgDim, marginTop: 3 }}>
              The new shape would overlap existing objects
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "10px 12px",
            marginBottom: 18,
            background: "rgba(217,119,87,0.08)",
            border: `1px solid ${isWarm ? "rgba(217,119,87,0.2)" : "rgba(217,119,87,0.15)"}`,
            borderRadius: 6,
            font: "12px/1.5 Inter, sans-serif",
            color: fg,
          }}
        >
          <div style={{ marginBottom: 6 }}>
            <strong>{conflictCount}</strong> {itemType.name} instance
            {conflictCount === 1 ? "" : "s"} would overlap with other objects or go out of bounds.
          </div>
          <div style={{ color: fgDim, fontSize: "11px" }}>
            You can remove the conflicting objects and apply the new shape, or cancel to keep
            everything as-is.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnStyle(theme, "ghost")}>
            Cancel
          </button>
          <button
            onClick={onRemoveConflicts}
            style={{
              padding: "8px 18px",
              background: warningColor,
              color: isWarm ? "#2a1f15" : "#0e1116",
              border: "none",
              borderRadius: 6,
              font: "500 12px/1 Inter, sans-serif",
              letterSpacing: "0.02em",
              cursor: "pointer",
            }}
          >
            Remove & Apply
          </button>
        </div>
      </div>
    </div>
  );
}
