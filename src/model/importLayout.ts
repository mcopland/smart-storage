import { cellsOf } from "./geometry";
import { GRID_MAX, GRID_MIN } from "./gridBounds";
import type { Cell, GridSize, Inventory, ItemType, Placement, Synergy, TypesById } from "./types";

export interface ImportedLayout {
  gridSize?: GridSize;
  placements?: Placement[];
  disabledCells?: string[];
  itemTypes?: ItemType[];
  inventory?: Inventory;
}

// The live board the file is merged into. An import is a patch, so any section
// the file omits keeps the current value -- and the merged result is what has
// to be legal.
export interface ImportContext {
  itemTypes: ItemType[];
  placements: Placement[];
  gridSize: GridSize;
  disabledCells: Set<string>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function requireNumber(obj: Record<string, unknown>, field: string, where: string): number {
  const v = obj[field];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`import failed: ${where} is missing a numeric "${field}"`);
  }
  return v;
}

function requireInt(obj: Record<string, unknown>, field: string, where: string): number {
  const v = requireNumber(obj, field, where);
  if (!Number.isInteger(v)) {
    throw new Error(`import failed: ${where} "${field}" must be an integer (got ${v})`);
  }
  return v;
}

// A grid dimension the UI would also accept: a huge value allocates w*h in the
// engine and renders w*h divs, and a zero or negative one has no valid board.
function requireBoundedInt(obj: Record<string, unknown>, field: string, where: string): number {
  const v = requireInt(obj, field, where);
  if (v < GRID_MIN || v > GRID_MAX) {
    throw new Error(
      `import failed: ${where} "${field}" must be between ${GRID_MIN} and ${GRID_MAX} (got ${v})`,
    );
  }
  return v;
}

function requireString(obj: Record<string, unknown>, field: string, where: string): string {
  const v = obj[field];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`import failed: ${where} is missing a non-empty string "${field}"`);
  }
  return v;
}

function parseCells(v: unknown, where: string): Cell[] {
  if (!Array.isArray(v)) {
    throw new Error(`import failed: ${where} "cells" must be an array of [x, y] pairs`);
  }
  const seen = new Set<string>();
  return v.map((c, i) => {
    if (
      !Array.isArray(c)
      || c.length !== 2
      || typeof c[0] !== "number"
      || typeof c[1] !== "number"
      || !Number.isInteger(c[0])
      || !Number.isInteger(c[1])
    ) {
      throw new Error(`import failed: ${where} cells[${i}] must be an [x, y] integer pair`);
    }
    // Shapes are stored normalized to the origin, so a negative offset would
    // put part of the footprint outside the placement's own anchor.
    if (c[0] < 0 || c[1] < 0) {
      throw new Error(
        `import failed: ${where} cells[${i}] must not be negative (got [${c[0]}, ${c[1]}])`,
      );
    }
    const key = `${c[0]},${c[1]}`;
    if (seen.has(key)) {
      throw new Error(`import failed: ${where} cells[${i}] repeats the cell [${key}]`);
    }
    seen.add(key);
    return [c[0], c[1]];
  });
}

// Older exports stored rectangular shapes as `size: [w, h]` instead of `cells`.
// Normalize here so the rest of the app (and the Rust engine) only sees `cells`.
function legacySizeToCells(size: unknown, where: string): Cell[] {
  if (
    !Array.isArray(size)
    || size.length !== 2
    || typeof size[0] !== "number"
    || typeof size[1] !== "number"
  ) {
    throw new Error(`import failed: ${where} legacy "size" must be a [w, h] number pair`);
  }
  const [w, h] = size;
  const cells: Cell[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells.push([dx, dy]);
  return cells;
}

// An absent tags/synergies list is a legitimate item type; a malformed one is a
// broken file. Dropping the bad entries would import a type that silently
// scores differently from the one the file describes.
function parseTags(v: unknown, where: string): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error(`import failed: ${where} "tags" must be an array`);
  return v.map((t, i) => {
    if (typeof t !== "string") {
      throw new Error(`import failed: ${where} tags[${i}] must be a string`);
    }
    return t;
  });
}

function parseSynergies(v: unknown, where: string): Synergy[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error(`import failed: ${where} "synergies" must be an array`);
  return v.map((s, i) => {
    if (!isRecord(s) || typeof s.tag !== "string" || s.tag.length === 0) {
      throw new Error(
        `import failed: ${where} synergies[${i}] is missing a non-empty string "tag"`,
      );
    }
    return { tag: s.tag, positive: s.positive !== false };
  });
}

function parseItemType(v: unknown, where: string): ItemType {
  if (!isRecord(v)) throw new Error(`import failed: ${where} must be an object`);
  const id = requireString(v, "id", where);
  const tags = parseTags(v.tags, where);
  const synergies = parseSynergies(v.synergies, where);
  const cells =
    Array.isArray(v.cells) && v.cells.length > 0
      ? parseCells(v.cells, where)
      : legacySizeToCells(v.size ?? [1, 1], where);
  return {
    id,
    tags,
    synergies,
    cells,
    name: typeof v.name === "string" ? v.name : id,
    glyph: typeof v.glyph === "string" ? v.glyph : "square",
    color: typeof v.color === "string" ? v.color : "#888888",
    desc: typeof v.desc === "string" ? v.desc : "",
  };
}

function parsePlacement(v: unknown, where: string): Placement {
  if (!isRecord(v)) throw new Error(`import failed: ${where} must be an object`);
  const rot = requireInt(v, "rot", where);
  if ((((rot % 360) + 360) % 360) % 90 !== 0) {
    throw new Error(`import failed: ${where} "rot" must be a multiple of 90 (got ${rot})`);
  }
  return {
    id: requireString(v, "id", where),
    type: requireString(v, "type", where),
    x: requireInt(v, "x", where),
    y: requireInt(v, "y", where),
    rot,
  };
}

// Parse and validate a layout export against the board it will be merged into.
// Every section is optional, so `current` supplies whatever the file omits.
export function parseImportedLayout(text: string, current: ImportContext): ImportedLayout {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`import failed: file is not valid JSON: ${detail}`, { cause: err });
  }
  if (!isRecord(raw)) {
    throw new Error("import failed: file must contain a JSON object at the top level");
  }

  const out: ImportedLayout = {};

  if (raw.gridSize !== undefined) {
    if (!isRecord(raw.gridSize)) throw new Error('import failed: "gridSize" must be an object');
    out.gridSize = {
      w: requireBoundedInt(raw.gridSize, "w", '"gridSize"'),
      h: requireBoundedInt(raw.gridSize, "h", '"gridSize"'),
    };
  }

  if (raw.itemTypes !== undefined) {
    if (!Array.isArray(raw.itemTypes))
      throw new Error('import failed: "itemTypes" must be an array');
    out.itemTypes = raw.itemTypes.map((t, i) => parseItemType(t, `itemTypes[${i}]`));
    const typeIds = new Set<string>();
    for (let i = 0; i < out.itemTypes.length; i++) {
      const { id } = out.itemTypes[i];
      if (typeIds.has(id)) {
        throw new Error(`import failed: duplicate item type id "${id}" in itemTypes[${i}]`);
      }
      typeIds.add(id);
    }
  }

  if (raw.placements !== undefined) {
    if (!Array.isArray(raw.placements))
      throw new Error('import failed: "placements" must be an array');
    out.placements = raw.placements.map((p, i) => parsePlacement(p, `placements[${i}]`));
    const seenIds = new Set<string>();
    for (let i = 0; i < out.placements.length; i++) {
      const p = out.placements[i];
      if (seenIds.has(p.id)) {
        throw new Error(`import failed: duplicate placement id "${p.id}" in placements[${i}]`);
      }
      seenIds.add(p.id);
    }
  }

  if (raw.disabledCells !== undefined) {
    if (!Array.isArray(raw.disabledCells)) {
      throw new Error('import failed: "disabledCells" must be an array');
    }
    out.disabledCells = raw.disabledCells.map((c, i) => {
      if (typeof c !== "string") {
        throw new Error(`import failed: disabledCells[${i}] must be an "x,y" string`);
      }
      if (!/^\d+,\d+$/.test(c)) {
        throw new Error(
          `import failed: disabledCells[${i}] must be an "x,y" integer pair string (got "${c}")`,
        );
      }
      return c;
    });
  }

  if (raw.inventory !== undefined) {
    if (!isRecord(raw.inventory)) throw new Error('import failed: "inventory" must be an object');
    const inventory: Inventory = {};
    for (const [k, v] of Object.entries(raw.inventory)) {
      if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
        throw new Error(`import failed: inventory count for "${k}" must be an integer`);
      }
      if (v < 0) {
        throw new Error(
          `import failed: inventory count for "${k}" must not be negative (got ${v})`,
        );
      }
      inventory[k] = v;
    }
    out.inventory = inventory;
  }

  // Validate the board the user will actually end up with. Checking only the
  // sections the file happens to carry lets a partial import land an illegal
  // board: itemTypes without placements can drop a type the current placements
  // still reference, and placements without gridSize would skip these checks
  // entirely.
  const types = out.itemTypes ?? current.itemTypes;
  const placements = out.placements ?? current.placements;
  const { w, h } = out.gridSize ?? current.gridSize;
  const disabled = new Set(out.disabledCells ?? current.disabledCells);
  const typesById: TypesById = Object.fromEntries(types.map(t => [t.id, t]));
  const fromFile = out.placements !== undefined;

  const occupied = new Set<string>();
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    // Index the file's own placements; the current board's have no index the
    // user could act on, so name them for what they are.
    const where = fromFile ? `placements[${i}] "${p.id}"` : `the current board's "${p.id}"`;
    if (!typesById[p.type]) {
      throw new Error(
        `import failed: placement "${p.id}" references unknown item type "${p.type}"`,
      );
    }
    const cells = cellsOf(p, typesById);
    for (const [cx, cy] of cells) {
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) {
        throw new Error(
          `import failed: ${where} footprint extends out of bounds for grid ${w}x${h}`,
        );
      }
      if (occupied.has(`${cx},${cy}`)) {
        throw new Error(`import failed: ${where} overlaps with a previously validated placement`);
      }
      if (disabled.has(`${cx},${cy}`)) {
        throw new Error(`import failed: ${where} footprint lands on a disabled cell`);
      }
    }
    for (const [cx, cy] of cells) occupied.add(`${cx},${cy}`);
  }

  return out;
}
