import type { Cell, ItemTypeCore, Placement, TypesById } from "./types";

// Rotate an array of cell offsets by 0/90/180/270 degrees CW, normalizing to origin.
export function rotateCells(baseCells: Cell[], rot: number): Cell[] {
  let cells: Cell[] = baseCells.map(c => [c[0], c[1]]);
  const times = (((rot % 360) + 360) % 360) / 90;
  for (let i = 0; i < times; i++) {
    const maxY = Math.max(...cells.map(c => c[1]));
    cells = cells.map(([x, y]) => [maxY - y, x]);
  }
  const minX = Math.min(...cells.map(c => c[0]));
  const minY = Math.min(...cells.map(c => c[1]));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}

// Get rotated shape cells for a placement, relative to (0,0).
export function getShapeCells(p: Placement, typesById: TypesById): Cell[] {
  const t = typesById[p.type];
  if (!t) throw new Error(`getShapeCells: unknown item type "${p.type}" for placement "${p.id}"`);
  return rotateCells(t.cells, p.rot);
}

// Bounding-box dimensions of a placement's shape.
export function getDims(p: Placement, typesById: TypesById): [number, number] {
  const cells = getShapeCells(p, typesById);
  const maxX = Math.max(...cells.map(c => c[0]));
  const maxY = Math.max(...cells.map(c => c[1]));
  return [maxX + 1, maxY + 1];
}

// Bounding-box of a type's base (unrotated) shape.
export function getTypeSize(tt: ItemTypeCore): [number, number] {
  const maxX = Math.max(...tt.cells.map(c => c[0]));
  const maxY = Math.max(...tt.cells.map(c => c[1]));
  return [maxX + 1, maxY + 1];
}

// Absolute cell positions of a placement on the grid.
export function cellsOf(p: Placement, typesById: TypesById): Cell[] {
  return getShapeCells(p, typesById).map(([dx, dy]) => [p.x + dx, p.y + dy]);
}

export function occupancyMap(placements: Placement[], typesById: TypesById): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of placements) {
    for (const [cx, cy] of cellsOf(p, typesById)) {
      map.set(`${cx},${cy}`, p.id);
    }
  }
  return map;
}

export function fits(
  p: Placement,
  placements: Placement[],
  gridW: number,
  gridH: number,
  ignoreId: string | null,
  disabledCells: Set<string> | null | undefined,
  typesById: TypesById,
): boolean {
  const cells = cellsOf(p, typesById);
  // Bounds check
  for (const [cx, cy] of cells) {
    if (cx < 0 || cy < 0 || cx >= gridW || cy >= gridH) return false;
  }
  // Occupancy + disabled check
  const occ = occupancyMap(
    placements.filter(q => q.id !== ignoreId),
    typesById,
  );
  for (const [cx, cy] of cells) {
    if (occ.has(`${cx},${cy}`)) return false;
    if (disabledCells && disabledCells.has(`${cx},${cy}`)) return false;
  }
  return true;
}

export function adjacent(a: Placement, b: Placement, typesById: TypesById): boolean {
  const cellsA = cellsOf(a, typesById);
  const cellsB = new Set(cellsOf(b, typesById).map(([x, y]) => `${x},${y}`));
  for (const [ax, ay] of cellsA) {
    if (cellsB.has(`${ax + 1},${ay}`)) return true;
    if (cellsB.has(`${ax - 1},${ay}`)) return true;
    if (cellsB.has(`${ax},${ay + 1}`)) return true;
    if (cellsB.has(`${ax},${ay - 1}`)) return true;
  }
  return false;
}

// Check if ALL placements fit within a given grid size.
export function allPlacementsFit(
  placements: Placement[],
  w: number,
  h: number,
  typesById: TypesById,
): boolean {
  for (const p of placements) {
    for (const [cx, cy] of cellsOf(p, typesById)) {
      if (cx >= w || cy >= h) return false;
    }
  }
  return true;
}

// Resize the grid to newW x newH, compacting placements toward the origin only
// as much as needed so a shrink can reclaim empty space on EITHER side. The grid
// always retracts from the right/bottom edges, so without this a shrink is blocked
// whenever something sits against the far edge even if there's slack on the near
// edge. We compute the occupied bounding box and shift everything left/up just
// enough that the far edge fits, never more, so a shrink that already has slack
// on the right/bottom doesn't move anything. Disabled cells shift with the
// placements (and drop if they fall outside). Returns null if the occupied span
// itself is wider/taller than the requested size (a true impossible shrink).
export function resizeFit(
  placements: Placement[],
  disabledCells: Set<string> | null | undefined,
  newW: number,
  newH: number,
  typesById: TypesById,
): { placements: Placement[]; disabled: Set<string> } | null {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of placements) {
    for (const [cx, cy] of cellsOf(p, typesById)) {
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
    }
  }
  const hasItems = maxX >= minX;
  const occW = hasItems ? maxX - minX + 1 : 0;
  const occH = hasItems ? maxY - minY + 1 : 0;
  if (occW > newW || occH > newH) return null; // genuinely too small
  // Shift left/up only enough to bring the far edge inside the new bounds.
  // dx <= minX is guaranteed since occW <= newW, so nothing goes negative.
  const dx = hasItems ? Math.max(0, maxX - newW + 1) : 0;
  const dy = hasItems ? Math.max(0, maxY - newH + 1) : 0;
  const placementsOut =
    dx || dy ? placements.map(p => ({ ...p, x: p.x - dx, y: p.y - dy })) : placements;
  const disabledOut = new Set<string>();
  if (disabledCells) {
    for (const k of disabledCells) {
      const [cx, cy] = k.split(",").map(Number);
      const nx = cx - dx,
        ny = cy - dy;
      if (nx >= 0 && ny >= 0 && nx < newW && ny < newH) disabledOut.add(`${nx},${ny}`);
    }
  }
  return { placements: placementsOut, disabled: disabledOut };
}
