import { useMemo, type CSSProperties } from "react";
import type { ItemType, PerItemScore } from "../../model/types";
import { Glyph } from "../Glyph";
import { MINUS } from "./chars";
import { ACCENT, DANGER } from "./styles";
import { SynergyRules } from "./SynergyRules";
import { TagChips } from "./TagChips";
import { TextField } from "./TextField";

function stockStepBtn(theme: string): CSSProperties {
  const isWarm = theme === "warm";
  return {
    width: 26,
    height: 26,
    background: "transparent",
    border: `1px solid ${isWarm ? "rgba(60,50,40,0.18)" : "rgba(255,255,255,0.12)"}`,
    borderRadius: 5,
    color: isWarm ? "#3a2f22" : "rgba(255,255,255,0.85)",
    font: '500 14px/1 "JetBrains Mono", monospace',
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };
}

export interface SelectedEditorProps {
  itemType: ItemType;
  detail?: PerItemScore | null;
  theme: string;
  allTypes: ItemType[];
  onUpdateType: (id: string, patch: Partial<ItemType>) => void;
  onDeleteType?: (id: string) => void;
  onEditShape?: (itemType: ItemType) => void;
  stock?: number;
  onSetStock?: (n: number) => void;
}

// Selected: editable object-definition form
export function SelectedEditor({
  itemType,
  detail,
  theme,
  allTypes,
  onUpdateType,
  onDeleteType,
  onEditShape,
  stock,
  onSetStock,
}: SelectedEditorProps) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgDim = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.5)";
  const fgFaint = isWarm ? "rgba(60,50,40,0.35)" : "rgba(255,255,255,0.32)";
  const border = isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.07)";
  const inputBg = isWarm ? "rgba(255,253,247,0.6)" : "rgba(255,255,255,0.03)";

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "5px 8px",
    background: inputBg,
    border: `1px solid ${border}`,
    borderRadius: 4,
    color: fg,
    font: '500 11.5px/1.2 "JetBrains Mono", monospace',
    outline: "none",
    fontVariantNumeric: "tabular-nums",
  };
  const labelStyle: CSSProperties = {
    font: '500 9px/1 "JetBrains Mono", monospace',
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: fgFaint,
  };

  const update = (patch: Partial<ItemType>) => onUpdateType(itemType.id, patch);

  // Suggest tags already defined anywhere in the catalog.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const tt of allTypes || []) for (const tg of tt.tags || []) set.add(tg);
    return Array.from(set).sort();
  }, [allTypes]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div
          style={{
            width: 44,
            height: 44,
            padding: 7,
            border: `1px solid ${border}`,
            borderRadius: 6,
            background: inputBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Glyph kind={itemType.glyph} style="solid" color={itemType.color} w={1} h={1} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...labelStyle, marginBottom: 4 }}>Name</div>
          <TextField
            value={itemType.name}
            onChange={v => update({ name: v })}
            style={{ ...inputStyle, font: "500 13px/1.2 Inter, sans-serif" }}
          />
        </div>
      </div>

      {onSetStock && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Stock</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={() => onSetStock(Math.max(0, (stock || 0) - 1))}
                title="Remove one from stock"
                style={stockStepBtn(theme)}
              >
                {MINUS}
              </button>
              <span
                style={{
                  minWidth: 30,
                  textAlign: "center",
                  font: '500 13px/1 "JetBrains Mono", monospace',
                  color: fg,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {stock || 0}
              </span>
              <button
                onClick={() => onSetStock((stock || 0) + 1)}
                title="Add one to stock - restock this object"
                style={stockStepBtn(theme)}
              >
                +
              </button>
            </div>
            <span style={{ font: "11px/1.4 Inter, sans-serif", color: fgDim }}>
              available to place
            </span>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Tags</div>
        <TagChips
          tags={itemType.tags}
          color={itemType.color}
          theme={theme}
          suggestions={allTags}
          onChange={tags => update({ tags })}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ ...labelStyle, marginBottom: 4 }}>Shape</div>
        <button
          onClick={() => onEditShape && onEditShape(itemType)}
          style={{
            width: "100%",
            padding: "8px 12px",
            background: inputBg,
            border: `1px solid ${border}`,
            borderRadius: 6,
            cursor: "pointer",
            font: "500 12px/1 Inter, sans-serif",
            letterSpacing: "0.02em",
            color: fg,
            transition: "background 120ms, border-color 120ms",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
          onPointerEnter={e => {
            e.currentTarget.style.background = isWarm
              ? "rgba(255,253,247,0.85)"
              : "rgba(255,255,255,0.05)";
            e.currentTarget.style.borderColor = itemType.color;
          }}
          onPointerLeave={e => {
            e.currentTarget.style.background = inputBg;
            e.currentTarget.style.borderColor = border;
          }}
        >
          <span>Edit shape grid</span>
          <span style={{ color: fgDim, font: '11px/1 "JetBrains Mono", monospace' }}>
            {itemType.cells?.length || 1} cells
          </span>
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ ...labelStyle, marginBottom: 4 }}>Description</div>
        <TextField
          value={itemType.desc}
          onChange={v => update({ desc: v })}
          multiline
          style={{ ...inputStyle, font: "11px/1.4 Inter, sans-serif", resize: "vertical" }}
        />
      </div>

      <div>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Synergy with</div>
        <SynergyRules
          synergies={itemType.synergies}
          theme={theme}
          suggestions={allTags}
          onChange={synergies => update({ synergies })}
        />
      </div>

      {detail && (
        <div
          style={{
            marginTop: 14,
            padding: "8px 10px",
            border: `1px solid ${border}`,
            borderRadius: 5,
            background: inputBg,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            font: '500 11px/1 "JetBrains Mono", monospace',
            color: fgDim,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>this instance</span>
          <span style={{ color: fg }}>
            <span style={{ color: fgFaint }}>synergy</span>{" "}
            <span
              style={{
                color: detail.total >= 0 ? ACCENT : DANGER,
                fontWeight: 600,
              }}
            >
              {detail.total >= 0 ? "+" : ""}
              {detail.total}
            </span>
          </span>
        </div>
      )}

      {onDeleteType && (
        <button
          onClick={() => onDeleteType(itemType.id)}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "8px 12px",
            background: "transparent",
            border: `1px solid ${isWarm ? "rgba(200,80,50,0.25)" : "rgba(255,100,80,0.18)"}`,
            borderRadius: 6,
            cursor: "pointer",
            font: "500 12px/1 Inter, sans-serif",
            letterSpacing: "0.02em",
            color: DANGER,
            transition: "background 120ms, border-color 120ms",
          }}
          onPointerEnter={e => {
            e.currentTarget.style.background = isWarm
              ? "rgba(200,80,50,0.06)"
              : "rgba(255,100,80,0.06)";
            e.currentTarget.style.borderColor = DANGER;
          }}
          onPointerLeave={e => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = isWarm
              ? "rgba(200,80,50,0.25)"
              : "rgba(255,100,80,0.18)";
          }}
        >
          Delete definition
        </button>
      )}
    </div>
  );
}
