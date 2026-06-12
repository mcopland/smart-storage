import { useMemo } from "react";
import { getShapeCells } from "../../model/geometry";
import type { CatalogById, Placement, ScoreResult } from "../../model/types";
import { glyphBox, pickGlyphCell } from "./shapeOutline";

export interface VizOverlayProps {
  placements: Placement[];
  scoreData: ScoreResult | null;
  cell: number;
  gap: number;
  gridW: number;
  gridH: number;
  mode: string;
  theme: string;
  selectedIds?: string[];
  highlightedTypeId?: string | null;
  typesById: CatalogById;
}

interface AdjPair {
  a: Placement;
  b: Placement;
  delta: number;
}

// Visualization overlays
export function VizOverlay({
  placements,
  scoreData,
  cell,
  gap,
  gridW,
  gridH,
  mode,
  theme,
  selectedIds = [],
  highlightedTypeId = null,
  typesById,
}: VizOverlayProps) {
  const totalW = gridW * cell + (gridW - 1) * gap;
  const totalH = gridH * cell + (gridH - 1) * gap;

  // When something is selected OR a type is hovered, the lines touching it read
  // forward; the rest recede.
  const selSet = new Set(selectedIds);
  const hasFocus = selSet.size > 0 || highlightedTypeId != null;
  const touchesFocus = (pair: AdjPair) =>
    selSet.has(pair.a.id)
    || selSet.has(pair.b.id)
    || (highlightedTypeId != null
      && (pair.a.type === highlightedTypeId || pair.b.type === highlightedTypeId));

  // Get the center of the glyph cell (gap-aware, matching the rendered glyph box)
  const glyphCenter = (p: Placement) => {
    const shapeCells = getShapeCells(p, typesById);
    const [gx, gy] = pickGlyphCell(shapeCells);
    const set = new Set(shapeCells.map(([x, y]) => `${x},${y}`));
    const has = (x: number, y: number) => set.has(`${x},${y}`);
    const gb = glyphBox(gx, gy, has, cell, gap);
    return {
      x: p.x * (cell + gap) + gb.left + gb.width / 2,
      y: p.y * (cell + gap) + gb.top + gb.height / 2,
    };
  };

  // Adjacency and per-pair deltas come straight from the engine's score
  // breakdown: each adjacent pair appears in both items' neighbor lists, and
  // the edge delta is the sum of the two directed contributions.
  const adjPairs = useMemo(() => {
    if (!scoreData) return [];
    const byId = new Map(placements.map(p => [p.id, p]));
    const out: AdjPair[] = [];
    for (const [idA, entry] of Object.entries(scoreData.perItem)) {
      for (const n of entry.neighbors) {
        if (idA >= n.id) continue; // each pair appears twice; keep one direction
        const a = byId.get(idA);
        const b = byId.get(n.id);
        if (!a || !b) continue;
        const back = scoreData.perItem[n.id]?.neighbors.find(m => m.id === idA);
        out.push({ a, b, delta: n.delta + (back?.delta ?? 0) });
      }
    }
    return out;
  }, [placements, scoreData]);

  return (
    <svg
      width={totalW}
      height={totalH}
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}
    >
      {(mode === "edges" || mode === "focus")
        && adjPairs.map((pair, i) => {
          const sel = touchesFocus(pair);
          // In "focus" mode the edges stay hidden until an object is hovered/selected,
          // and then only the edges touching the focused object(s) are drawn.
          if (mode === "focus" && !sel) return null;
          const ca = glyphCenter(pair.a),
            cb = glyphCenter(pair.b);
          const colorA = typesById[pair.a.type]!.color;
          const colorB = typesById[pair.b.type]!.color;
          const positive = pair.delta >= 0;
          const gradId = `edge-grad-${i}`;
          // Blend both endpoints' colors along the line (penalty still shown via dashes).
          const stroke = `url(#${gradId})`;
          const dim = hasFocus && !sel;
          const haloW = sel ? 9 : 6;
          const haloOp = dim ? 0.05 : sel ? 0.34 : 0.18;
          const lineW = sel ? 2.5 : 1.5;
          const lineOp = dim ? 0.18 : sel ? 1 : 0.7;
          return (
            <g key={i} style={{ transition: "opacity 160ms ease" }}>
              <linearGradient
                id={gradId}
                gradientUnits="userSpaceOnUse"
                x1={ca.x}
                y1={ca.y}
                x2={cb.x}
                y2={cb.y}
              >
                <stop offset="0%" stopColor={colorA} />
                <stop offset="100%" stopColor={colorB} />
              </linearGradient>
              <line
                x1={ca.x}
                y1={ca.y}
                x2={cb.x}
                y2={cb.y}
                stroke={stroke}
                strokeWidth={haloW}
                opacity={haloOp}
                strokeLinecap="round"
              />
              <line
                x1={ca.x}
                y1={ca.y}
                x2={cb.x}
                y2={cb.y}
                stroke={stroke}
                strokeWidth={lineW}
                opacity={lineOp}
                strokeLinecap="round"
                strokeDasharray={positive ? "0" : "4 4"}
              />
            </g>
          );
        })}
      {mode === "lines"
        && adjPairs.map((pair, i) => {
          const ca = glyphCenter(pair.a),
            cb = glyphCenter(pair.b);
          const mx = (ca.x + cb.x) / 2;
          const my = (ca.y + cb.y) / 2;
          const positive = pair.delta >= 0;
          const sel = touchesFocus(pair);
          const dim = hasFocus && !sel;
          const stroke = theme === "warm" ? "rgba(60,50,40,0.45)" : "rgba(255,255,255,0.35)";
          const labelBg = theme === "warm" ? "#fbf8f0" : "#0e1116";
          const labelFg = positive
            ? theme === "warm"
              ? "#3a2f22"
              : "rgba(255,255,255,0.92)"
            : "oklch(0.7 0.18 25)";
          return (
            <g key={i} opacity={dim ? 0.22 : 1} style={{ transition: "opacity 160ms ease" }}>
              <line
                x1={ca.x}
                y1={ca.y}
                x2={cb.x}
                y2={cb.y}
                stroke={stroke}
                strokeWidth={sel ? 2 : 1}
                strokeDasharray={positive ? "0" : "3 3"}
              />
              {pair.delta !== 0 && (
                <g transform={`translate(${mx},${my})`}>
                  <rect
                    x={-12}
                    y={-7}
                    width={24}
                    height={14}
                    rx={3}
                    fill={labelBg}
                    stroke={stroke}
                    strokeWidth={sel ? 1 : 0.5}
                  />
                  <text
                    x={0}
                    y={3.5}
                    textAnchor="middle"
                    fontFamily="'JetBrains Mono', monospace"
                    fontSize="9"
                    fontWeight={sel ? 600 : 500}
                    fill={labelFg}
                  >
                    {positive ? "+" : ""}
                    {pair.delta}
                  </text>
                </g>
              )}
            </g>
          );
        })}
    </svg>
  );
}
