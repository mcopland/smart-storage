import { useEffect, useRef } from "react";
import type { Cell } from "../../model/types";
import { CHECK } from "./chars";

const CELL_SIZE = 44;
const GAP = 4;
const GRID_SIZE = 5;

// 5x5 click-and-drag paint grid shared by the new-object and edit-shape modals.
// Painting starts in "paint" or "erase" mode depending on the first cell hit and
// keeps that mode for the whole drag. The shape can never be erased to zero cells.
export function ShapePaintGrid({
  cells,
  onChange,
  color,
  theme,
  active,
}: {
  cells: Cell[];
  onChange: (next: Cell[]) => void;
  color: string;
  theme: string;
  active: boolean;
}) {
  const isWarm = theme === "warm";
  const cellBorder = isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.08)";
  const cellBg = isWarm ? "rgba(255,253,247,0.5)" : "rgba(255,255,255,0.02)";

  const paintMode = useRef<"paint" | "erase" | null>(null);
  useEffect(() => {
    if (!active) return;
    const stop = () => {
      paintMode.current = null;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [active]);

  const setCellActive = (cx: number, cy: number, on: boolean) => {
    const exists = cells.some(([x, y]) => x === cx && y === cy);
    if (on) {
      if (!exists) onChange([...cells, [cx, cy]]);
      return;
    }
    if (!exists) return;
    const next = cells.filter(([x, y]) => !(x === cx && y === cy));
    if (next.length > 0) onChange(next); // keep at least one cell
  };

  const onCellPointerDown = (e: React.PointerEvent<HTMLButtonElement>, cx: number, cy: number) => {
    e.preventDefault();
    // Release implicit pointer capture so pointerenter fires on sibling cells as we drag.
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {
      // releasePointerCapture throws if the pointer is no longer captured; painting still works.
      void err;
    }
    const isActive = cells.some(([x, y]) => x === cx && y === cy);
    paintMode.current = isActive ? "erase" : "paint";
    setCellActive(cx, cy, paintMode.current === "paint");
  };

  const onCellPointerEnter = (cx: number, cy: number) => {
    if (!paintMode.current) return;
    setCellActive(cx, cy, paintMode.current === "paint");
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL_SIZE}px)`,
        gap: GAP,
        justifyContent: "center",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
        const cy = Math.floor(i / GRID_SIZE);
        const cx = i % GRID_SIZE;
        const isActive = cells.some(([x, y]) => x === cx && y === cy);
        return (
          <button
            key={i}
            onPointerDown={e => onCellPointerDown(e, cx, cy)}
            style={{
              width: CELL_SIZE,
              height: CELL_SIZE,
              border: `1px solid ${isActive ? color : cellBorder}`,
              borderRadius: 6,
              background: isActive ? `color-mix(in oklab, ${color} 13%, transparent)` : cellBg,
              cursor: "pointer",
              transition: "all 140ms ease",
              position: "relative",
              touchAction: "none",
            }}
            onPointerEnter={e => {
              onCellPointerEnter(cx, cy);
              if (!paintMode.current && !isActive) {
                e.currentTarget.style.borderColor = color;
                e.currentTarget.style.background = `color-mix(in oklab, ${color} 7%, transparent)`;
              }
            }}
            onPointerLeave={e => {
              if (!isActive) {
                e.currentTarget.style.borderColor = cellBorder;
                e.currentTarget.style.background = cellBg;
              }
            }}
          >
            {isActive && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: color,
                  fontSize: "18px",
                  fontWeight: 600,
                }}
              >
                {CHECK}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Normalize painted cells so the shape's bounding box starts at the origin.
export function normalizeCells(cells: Cell[]): Cell[] {
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}
