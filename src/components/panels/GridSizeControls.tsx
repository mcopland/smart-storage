import type { CSSProperties } from "react";
import { MINUS, TIMES } from "./chars";

function inlineStepBtn(theme: string): CSSProperties {
  const isWarm = theme === "warm";
  return {
    width: 20,
    height: 20,
    background: "transparent",
    border: `1px solid ${isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)"}`,
    borderRadius: 3,
    color: isWarm ? "#3a2f22" : "rgba(255,255,255,0.85)",
    font: '500 11px/1 "JetBrains Mono", monospace',
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };
}

function InlineStep({
  value,
  onChange,
  min,
  max,
  theme,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  theme: string;
}) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        style={inlineStepBtn(theme)}
        title="Decrease"
      >
        {MINUS}
      </button>
      <span
        style={{
          width: 22,
          textAlign: "center",
          font: '500 12px/1 "JetBrains Mono", monospace',
          color: fg,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        style={inlineStepBtn(theme)}
        title="Increase"
      >
        +
      </button>
    </div>
  );
}

// Inline Grid Size Controls (no popup, auto-apply, safe resize)
export function GridSizeControls({
  gridW,
  gridH,
  onChangeW,
  onChangeH,
  theme,
}: {
  gridW: number;
  gridH: number;
  onChangeW: (w: number) => void;
  onChangeH: (h: number) => void;
  theme: string;
}) {
  const isWarm = theme === "warm";
  const fgFaint = isWarm ? "rgba(60,50,40,0.4)" : "rgba(255,255,255,0.35)";
  const border = isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 32,
        padding: "0 10px",
        border: `1px solid ${border}`,
        borderRadius: 5,
      }}
    >
      <span
        style={{
          color: fgFaint,
          font: '500 10px/1 "JetBrains Mono", monospace',
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        grid
      </span>
      <InlineStep value={gridW} onChange={onChangeW} min={2} max={20} theme={theme} />
      <span style={{ color: fgFaint, font: "12px/1 Inter, sans-serif" }}>{TIMES}</span>
      <InlineStep value={gridH} onChange={onChangeH} min={2} max={20} theme={theme} />
    </div>
  );
}
