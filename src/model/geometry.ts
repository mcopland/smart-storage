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

// Build a set of "x,y" keys for every cell occupied by the given placements.
// Cheaper than occupancyMap when we only need membership, not which id owns each cell.
function occupiedKeys(placements: Placement[], typesById: TypesById): Set<string> {
  const set = new Set<string>();
  for (const p of placements) {
    for (const [cx, cy] of cellsOf(p, typesById)) {
      set.add(`${cx},${cy}`);
    }
  }
  return set;
}

// Low-level check: do these absolute grid cells fit without hitting grid edges,
// occupied cells, or disabled cells? The caller is responsible for building
// `occupied` with any "self" placement already excluded.
export function cellsFitIn(
  cells: Cell[],
  occupied: Set<string>,
  gridW: number,
  gridH: number,
  disabledCells: Set<string> | null | undefined,
): boolean {
  for (const [cx, cy] of cells) {
    if (cx < 0 || cy < 0 || cx >= gridW || cy >= gridH) return false;
    if (occupied.has(`${cx},${cy}`)) return false;
    if (disabledCells && disabledCells.has(`${cx},${cy}`)) return false;
  }
  return true;
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
  const occupied = occupiedKeys(
    ignoreId ? placements.filter(q => q.id !== ignoreId) : placements,
    typesById,
  );
  return cellsFitIn(cells, occupied, gridW, gridH, disabledCells);
}

// Scan row-major, trying all four rotations per cell. Builds occupancy once
// and pre-rotates the type's cells rather than re-deriving them every iteration.
export function findFirstFit(
  type: string,
  id: string,
  placed: Placement[],
  gridW: number,
  gridH: number,
  disabledCells: Set<string>,
  typesById: TypesById,
): Placement | null {
  const t = typesById[type];
  if (!t) return null;
  // Exclude the target id itself in case it's already in `placed` (e.g. rotate-in-place).
  const occupied = occupiedKeys(id ? placed.filter(q => q.id !== id) : placed, typesById);
  const rots = ([0, 90, 180, 270] as const).map(rot => ({
    rot,
    cells: rotateCells(t.cells, rot),
  }));
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      for (const { rot, cells } of rots) {
        const abs: Cell[] = cells.map(([dx, dy]) => [x + dx, y + dy]);
        if (cellsFitIn(abs, occupied, gridW, gridH, disabledCells)) return { id, type, x, y, rot };
      }
    }
  }
  return null;
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
