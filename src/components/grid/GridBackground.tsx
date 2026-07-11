import { memo } from "react";

// The per-cell background layer. Memoized because GridSurface re-renders on
// every pointer-move during drags, while these N*M nodes only depend on the
// grid geometry, disabled set, and theme.
export const GridBackground = memo(function GridBackground({
  gridW,
  gridH,
  cell,
  gap,
  disabledCells,
  isWarm,
}: {
  gridW: number;
  gridH: number;
  cell: number;
  gap: number;
  disabledCells: Set<string>;
  isWarm: boolean;
}) {
  const dots = [];
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const key = `${x},${y}`;
      const isDisabled = disabledCells.has(key);
      dots.push(
        <div
          key={key}
          className="grid-bg"
          data-cell-x={x}
          data-cell-y={y}
          style={{
            position: "absolute",
            left: x * (cell + gap),
            top: y * (cell + gap),
            width: cell,
            height: cell,
            border: `1px solid ${
              isDisabled
                ? isWarm
                  ? "rgba(60,50,40,0.18)"
                  : "rgba(255,255,255,0.12)"
                : isWarm
                  ? "rgba(60,50,40,0.07)"
                  : "rgba(255,255,255,0.05)"
            }`,
            borderRadius: 5,
            background: isDisabled
              ? isWarm
                ? "repeating-linear-gradient(135deg, rgba(60,50,40,0.08) 0 2px, transparent 2px 6px)"
                : "repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 6px)"
              : isWarm
                ? "rgba(255,253,247,0.4)"
                : "rgba(255,255,255,0.012)",
          }}
        />,
      );
    }
  }

  return (
    <div className="grid-bg" style={{ position: "absolute", inset: 0 }}>
      {dots}
    </div>
  );
});
