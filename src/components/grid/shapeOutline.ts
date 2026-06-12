import type { Cell } from "../../model/types";

// Pick the cell on which to anchor the glyph: take every active tile, find the
// center of mass of that whole selection, then snap to the active tile whose
// center is closest to it, i.e. the centermost available tile. This works for any
// footprint, including hollow rings and disconnected/symmetric clusters where the
// true center may be an empty cell. Ties (several equidistant tiles, e.g. the four
// inner tiles of an even ring) are broken toward the most-embedded tile, then
// top-left, so the choice is deterministic.
export function pickGlyphCell(shapeCells: Cell[]): Cell {
  if (shapeCells.length === 0) return [0, 0];
  if (shapeCells.length === 1) return shapeCells[0];
  const set = new Set(shapeCells.map(([x, y]) => `${x},${y}`));
  // Center of mass of all active tiles (using tile centers).
  const cx = shapeCells.reduce((s, c) => s + c[0] + 0.5, 0) / shapeCells.length;
  const cy = shapeCells.reduce((s, c) => s + c[1] + 0.5, 0) / shapeCells.length;
  const neighbors = (x: number, y: number) =>
    (set.has(`${x + 1},${y}`) ? 1 : 0)
    + (set.has(`${x - 1},${y}`) ? 1 : 0)
    + (set.has(`${x},${y + 1}`) ? 1 : 0)
    + (set.has(`${x},${y - 1}`) ? 1 : 0);
  let best = shapeCells[0];
  let bestD = Infinity,
    bestN = -1,
    bestY = Infinity,
    bestX = Infinity;
  for (const [x, y] of shapeCells) {
    const d = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
    const n = neighbors(x, y);
    const better =
      d < bestD - 1e-9
        ? true
        : d > bestD + 1e-9
          ? false
          : n !== bestN
            ? n > bestN
            : y !== bestY
              ? y < bestY
              : x < bestX;
    if (better) {
      best = [x, y];
      bestD = d;
      bestN = n;
      bestY = y;
      bestX = x;
    }
  }
  return best;
}

export interface GlyphBoxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Centered box for a shape's glyph within its cell, accounting for the gap-fill
// that visually merges this cell with its in-shape neighbours. The tile background
// bleeds half a gap into each neighbouring side, so the glyph must be centered on
// the cell expanded by gap/2 on every side that has a neighbour; otherwise it
// reads as pushed toward the open corner. Returns coords relative to the
// placement origin. Line connectors anchor to this same box center so they line up.
export function glyphBox(
  gx: number,
  gy: number,
  has: (x: number, y: number) => boolean,
  cell: number,
  gap: number,
): GlyphBoxRect {
  const l = has(gx - 1, gy) ? gap / 2 : 0;
  const r = has(gx + 1, gy) ? gap / 2 : 0;
  const t = has(gx, gy - 1) ? gap / 2 : 0;
  const b = has(gx, gy + 1) ? gap / 2 : 0;
  return {
    left: gx * (cell + gap) - l,
    top: gy * (cell + gap) - t,
    width: cell + l + r,
    height: cell + t + b,
  };
}

type Rect = [number, number, number, number];

// Build the filled region of a polyomino as a union of axis-aligned rectangles:
// each cell square, plus cell-aligned bridges into the gap toward in-shape
// neighbours (and the inner corner when a 2x2 block is solid). Bridges are exactly
// cell-width/height so the union has a clean rectilinear boundary with no diagonal
// nubs poking into concave corners.
function shapeRegionRects(cells: Cell[], cell: number, gap: number): Rect[] {
  const p = cell + gap;
  const set = new Set(cells.map(c => c[0] + "," + c[1]));
  const has = (x: number, y: number) => set.has(x + "," + y);
  const rects: Rect[] = [];
  for (const [x, y] of cells) {
    rects.push([x * p, y * p, x * p + cell, y * p + cell]);
    if (has(x + 1, y)) rects.push([x * p + cell, y * p, x * p + cell + gap, y * p + cell]);
    if (has(x, y + 1)) rects.push([x * p, y * p + cell, x * p + cell, y * p + cell + gap]);
    if (has(x + 1, y) && has(x, y + 1) && has(x + 1, y + 1))
      rects.push([x * p + cell, y * p + cell, x * p + cell + gap, y * p + cell + gap]);
  }
  return rects;
}

interface Point {
  x: number;
  y: number;
}

// Trace the outer boundary loops of a union of rectangles via a coordinate lattice
// + marching. Returns an array of loops, each an array of {x,y} vertices.
function unionContours(rects: Rect[]): Point[][] {
  if (rects.length === 0) return [];
  const xs = [...new Set(rects.flatMap(r => [r[0], r[2]]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap(r => [r[1], r[3]]))].sort((a, b) => a - b);
  const nx = xs.length - 1,
    ny = ys.length - 1;
  const inside = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= nx || j >= ny) return false;
    const cx = (xs[i] + xs[i + 1]) / 2,
      cy = (ys[j] + ys[j + 1]) / 2;
    return rects.some(r => cx > r[0] && cx < r[2] && cy > r[1] && cy < r[3]);
  };
  type Edge = { a: Cell; b: Cell; used: boolean };
  const key = (pt: Cell) => pt[0] + "," + pt[1];
  const startMap = new Map<string, Edge>();
  const pushEdge = (a: Cell, b: Cell) => {
    startMap.set(key(a), { a, b, used: false });
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!inside(i, j)) continue;
      const x0 = xs[i],
        x1 = xs[i + 1],
        y0 = ys[j],
        y1 = ys[j + 1];
      if (!inside(i, j - 1)) pushEdge([x1, y0], [x0, y0]); // top  (interior below)
      if (!inside(i, j + 1)) pushEdge([x0, y1], [x1, y1]); // bottom
      if (!inside(i - 1, j)) pushEdge([x0, y0], [x0, y1]); // left
      if (!inside(i + 1, j)) pushEdge([x1, y1], [x1, y0]); // right
    }
  }
  const loops: Point[][] = [];
  for (const seed of startMap.values()) {
    if (seed.used) continue;
    const loop: Point[] = [];
    let cur: Edge | undefined = seed;
    while (cur && !cur.used) {
      cur.used = true;
      loop.push({ x: cur.a[0], y: cur.a[1] });
      cur = startMap.get(key(cur.b));
    }
    // collapse collinear vertices
    const simplified: Point[] = [];
    for (let k = 0; k < loop.length; k++) {
      const a = loop[(k - 1 + loop.length) % loop.length];
      const b = loop[k];
      const c = loop[(k + 1) % loop.length];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(cross) > 1e-6) simplified.push(b);
    }
    if (simplified.length >= 3) loops.push(simplified);
  }
  return loops;
}

// Rounded SVG path for a polygon (rounds every corner, convex and concave).
function roundedLoopPath(pts: Point[], r: number): string {
  const n = pts.length;
  if (n < 3) return "";
  let d = "";
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n],
      p1 = pts[i],
      p2 = pts[(i + 1) % n];
    const v1x = p0.x - p1.x,
      v1y = p0.y - p1.y;
    const v2x = p2.x - p1.x,
      v2y = p2.y - p1.y;
    const l1 = Math.hypot(v1x, v1y),
      l2 = Math.hypot(v2x, v2y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const ax = p1.x + (v1x / l1) * rr,
      ay = p1.y + (v1y / l1) * rr;
    const bx = p1.x + (v2x / l2) * rr,
      by = p1.y + (v2y / l2) * rr;
    d += (i === 0 ? `M ${ax} ${ay} ` : `L ${ax} ${ay} `) + `Q ${p1.x} ${p1.y} ${bx} ${by} `;
  }
  return d + "Z";
}

export function shapeOutlinePath(cells: Cell[], cell: number, gap: number, radius: number): string {
  return unionContours(shapeRegionRects(cells, cell, gap))
    .map(loop => roundedLoopPath(loop, radius))
    .join(" ");
}
