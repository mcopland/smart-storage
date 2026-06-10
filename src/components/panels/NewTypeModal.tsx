import { useEffect, useState, type CSSProperties } from "react";
import { COLOR_NAMES, getNextAvailableCombo, GLYPH_NAMES, type Combo } from "../../model/catalog";
import type { Cell, ItemType } from "../../model/types";
import { ShapePaintGrid, normalizeCells } from "./ShapePaintGrid";
import { btnStyle } from "./styles";

// Random name generator: uses assigned combo's color and shape names
function getComboName(combo: Combo | null): string {
  if (!combo) return "New Object";
  const colorName = COLOR_NAMES[combo.color] || "Unknown";
  const glyphName = GLYPH_NAMES[combo.glyph] || "Shape";
  return `${colorName} ${glyphName}`;
}

export interface NewTypeModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (newType: ItemType, count: number) => void;
  theme: string;
  itemTypes: ItemType[];
}

// New Object modal (simplified, auto-assigns combo)
export function NewTypeModal({ open, onClose, onCreate, theme, itemTypes }: NewTypeModalProps) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgDim = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.5)";
  const fgFaint = isWarm ? "rgba(60,50,40,0.4)" : "rgba(255,255,255,0.35)";
  const border = isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)";
  const surface = isWarm ? "#fbf8f0" : "#141a23";
  const inputBg = isWarm ? "rgba(255,253,247,0.6)" : "rgba(255,255,255,0.03)";

  const [name, setName] = useState("");
  const [count, setCount] = useState("1");
  const [assignedCombo, setAssignedCombo] = useState<Combo | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);

  useEffect(() => {
    if (open) {
      const combo = getNextAvailableCombo(itemTypes);
      if (!combo) {
        onClose();
        return;
      }
      setAssignedCombo(combo);
      setCells(combo.cells);
      setName(getComboName(combo));
      setCount("1");
    }
  }, [open, onClose, itemTypes]);

  if (!open) return null;

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "6px 9px",
    background: inputBg,
    border: `1px solid ${border}`,
    borderRadius: 5,
    color: fg,
    font: '500 12px/1.2 "JetBrains Mono", monospace',
    outline: "none",
  };
  const labelStyle: CSSProperties = {
    font: '500 9px/1 "JetBrains Mono", monospace',
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: fgFaint,
    marginBottom: 4,
  };

  const submit = () => {
    if (!assignedCombo || cells.length === 0) return;
    const id =
      (name.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "type_")
      + Date.now().toString(36).slice(-3);
    onCreate(
      {
        id,
        name: name || "Untitled",
        glyph: assignedCombo.glyph,
        color: assignedCombo.color,
        cells: normalizeCells(cells),
        tags: [],
        desc: "",
        synergies: [],
      },
      parseInt(count, 10) || 0,
    );
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
          padding: 20,
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 10,
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ font: "600 15px/1.3 Inter, sans-serif", color: fg }}>New Object</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ ...labelStyle, marginBottom: 4 }}>Name</div>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ ...inputStyle, font: "500 13px/1.2 Inter, sans-serif" }}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>Quantity</div>
          <input
            type="number"
            value={count}
            onChange={e => setCount(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Shape editor */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Shape</div>
          <ShapePaintGrid
            cells={cells}
            onChange={setCells}
            color={assignedCombo?.color || "transparent"}
            theme={theme}
            active={open}
          />
          <div
            style={{
              marginTop: 8,
              font: '11px/1.4 "JetBrains Mono", monospace',
              color: fgDim,
              textAlign: "center",
            }}
          >
            {cells.length} cell{cells.length === 1 ? "" : "s"} selected
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnStyle(theme, "ghost")}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={cells.length === 0}
            style={{
              ...btnStyle(theme, "primary", cells.length === 0),
              padding: "8px 18px",
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
