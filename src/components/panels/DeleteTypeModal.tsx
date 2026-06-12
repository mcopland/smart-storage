import { useEffect } from "react";
import type { ItemType } from "../../model/types";
import { Glyph } from "../Glyph";
import { btnStyle, DANGER } from "./styles";

export interface DeleteTypeModalProps {
  open: boolean;
  itemType: ItemType | null;
  placementCount: number;
  onConfirm: () => void;
  onClose: () => void;
  theme: string;
}

// Delete Type Confirmation Modal
export function DeleteTypeModal({
  open,
  itemType,
  placementCount,
  onConfirm,
  onClose,
  theme,
}: DeleteTypeModalProps) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgDim = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.5)";
  const border = isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)";
  const surface = isWarm ? "#fbf8f0" : "#141a23";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onConfirm, onClose]);

  if (!open || !itemType) return null;

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
          width: 360,
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
              Delete "{itemType.name}"?
            </div>
            <div style={{ font: "12px/1.4 Inter, sans-serif", color: fgDim, marginTop: 3 }}>
              This will remove the object definition
              {placementCount > 0
                ? ` and ${placementCount} placed instance${placementCount === 1 ? "" : "s"} from the grid`
                : ""}
              .
            </div>
          </div>
        </div>

        {placementCount > 0 && (
          <div
            style={{
              padding: "8px 10px",
              marginBottom: 16,
              background: isWarm ? "rgba(200,80,50,0.06)" : "rgba(255,100,80,0.06)",
              border: `1px solid ${isWarm ? "rgba(200,80,50,0.15)" : "rgba(255,100,80,0.12)"}`,
              borderRadius: 6,
              font: "11.5px/1.4 Inter, sans-serif",
              color: DANGER,
            }}
          >
            {placementCount} instance{placementCount === 1 ? "" : "s"} on the grid will be removed.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnStyle(theme, "ghost")}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 18px",
              background: DANGER,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              font: "500 12px/1 Inter, sans-serif",
              letterSpacing: "0.02em",
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
