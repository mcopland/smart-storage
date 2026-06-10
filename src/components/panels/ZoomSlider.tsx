// Zoom slider
export function ZoomSlider({
  value,
  onChange,
  theme,
}: {
  value: number;
  onChange: (v: number) => void;
  theme: string;
}) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgFaint = isWarm ? "rgba(60,50,40,0.4)" : "rgba(255,255,255,0.35)";
  const border = isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 10px",
        height: 32,
        border: `1px solid ${border}`,
        borderRadius: 5,
      }}
      title="Zoom"
    >
      <span
        style={{
          color: fgFaint,
          font: '500 10px/1 "JetBrains Mono", monospace',
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        zoom
      </span>
      <input
        type="range"
        min={100}
        max={200}
        step={5}
        value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        style={{ width: 80, accentColor: "oklch(0.78 0.12 195)" }}
      />
      <span
        style={{
          color: fg,
          font: '500 11px/1 "JetBrains Mono", monospace',
          fontVariantNumeric: "tabular-nums",
          width: 36,
          textAlign: "right",
        }}
      >
        {value}%
      </span>
    </div>
  );
}
