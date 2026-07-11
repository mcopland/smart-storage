import { cellsOf } from "./geometry";
import type { Cell, GridSize, Inventory, ItemType, Placement, TypesById } from "./types";

export interface ImportedLayout {
  gridSize?: GridSize;
  placements?: Placement[];
  disabledCells?: string[];
  itemTypes?: ItemType[];
  inventory?: Inventory;
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

function parseItemType(v: unknown, where: string): ItemType {
  if (!isRecord(v)) throw new Error(`import failed: ${where} must be an object`);
  const id = requireString(v, "id", where);
  const tags = Array.isArray(v.tags)
    ? v.tags.filter((t): t is string => typeof t === "string")
    : [];
  const synergies = Array.isArray(v.synergies)
    ? v.synergies.flatMap(s =>
        isRecord(s) && typeof s.tag === "string"
          ? [{ tag: s.tag, positive: s.positive !== false }]
          : [],
      )
    : [];
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

// Parse and validate a layout export. `currentTypes` is the active catalog,
// used to resolve placement types when the file doesn't ship its own.
export function parseImportedLayout(text: string, currentTypes: ItemType[]): ImportedLayout {
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
      w: requireInt(raw.gridSize, "w", '"gridSize"'),
      h: requireInt(raw.gridSize, "h", '"gridSize"'),
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
    const known = new Set((out.itemTypes ?? currentTypes).map(t => t.id));
    const seenIds = new Set<string>();
    for (let i = 0; i < out.placements.length; i++) {
      const p = out.placements[i];
      if (seenIds.has(p.id)) {
        throw new Error(`import failed: duplicate placement id "${p.id}" in placements[${i}]`);
      }
      seenIds.add(p.id);
      if (!known.has(p.type)) {
        throw new Error(
          `import failed: placement "${p.id}" references unknown item type "${p.type}"`,
        );
      }
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
      inventory[k] = v;
    }
    out.inventory = inventory;
  }

  // Full footprint validation: bounds, overlap, and disabled-cell checks.
  // Requires gridSize; only possible once all fields are parsed so disabledCells is available.
  if (out.gridSize && out.placements && out.placements.length > 0) {
    const { w, h } = out.gridSize;
    const typesById: TypesById = Object.fromEntries(
      (out.itemTypes ?? currentTypes).map(t => [t.id, t]),
    );
    const disabled = new Set(out.disabledCells ?? []);
    const occupied = new Set<string>();
    for (let i = 0; i < out.placements.length; i++) {
      const p = out.placements[i];
      const cells = cellsOf(p, typesById);
      for (const [cx, cy] of cells) {
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) {
          throw new Error(
            `import failed: placements[${i}] "${p.id}" footprint extends out of bounds for grid ${w}x${h}`,
          );
        }
        if (occupied.has(`${cx},${cy}`)) {
          throw new Error(
            `import failed: placements[${i}] "${p.id}" overlaps with a previously validated placement`,
          );
        }
        if (disabled.has(`${cx},${cy}`)) {
          throw new Error(
            `import failed: placements[${i}] "${p.id}" footprint lands on a disabled cell`,
          );
        }
      }
      for (const [cx, cy] of cells) occupied.add(`${cx},${cy}`);
    }
  }

  return out;
}
