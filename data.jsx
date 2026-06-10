// data.jsx — item catalog with cell-based shapes, adjacency rules, layout helpers

// 8 highly contrasting colors × 8 recognizable glyphs = 64 unique combos
const PREDEFINED_COLORS = [
  "oklch(0.78 0.12 195)", // teal
  "oklch(0.82 0.10 240)", // blue
  "oklch(0.86 0.16 110)", // lime
  "oklch(0.78 0.13 25)", // red-orange
  "oklch(0.83 0.10 305)", // violet
  "oklch(0.80 0.05 165)", // sage
  "oklch(0.72 0.17 145)", // green
  "oklch(0.80 0.12 45)", // amber
];

const PREDEFINED_GLYPHS = ["hex", "diamond", "tri", "rect", "circle", "pent", "star", "cross"];

// Default cells for each glyph when auto-assigning
const DEFAULT_CELLS_FOR_GLYPH = {
  hex: [[0, 0]],
  diamond: [[0, 0]],
  tri: [
    [0, 0],
    [1, 0],
    [1, 1],
  ],
  rect: [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1],
  ],
  circle: [[0, 0]],
  pent: [
    [0, 0],
    [0, 1],
    [1, 1],
  ],
  star: [
    [0, 0],
    [1, 0],
  ],
  cross: [
    [0, 0],
    [0, 1],
  ],
};

const MAX_OBJECT_TYPES = PREDEFINED_COLORS.length * PREDEFINED_GLYPHS.length; // 64

// Objects carry `tags` (what they ARE) and `synergies` (tag-based rules: each is
// simply positive (bonus) or negative (penalty) toward objects carrying a given
// tag). There is no base score — an object's score is purely the sum of its
// synergy connections, each worth +1 or -1.
const ITEM_TYPES = [
  {
    id: "core",
    name: "Core",
    glyph: "hex",
    color: "oklch(0.78 0.12 195)",
    desc: "Foundation unit. Strong clustered with power and signal.",
    tags: ["Power", "Core"],
    synergies: [
      { tag: "Core", positive: true },
      { tag: "Signal", positive: true },
    ],
    cells: [[0, 0]],
  },
  {
    id: "relay",
    name: "Relay",
    glyph: "diamond",
    color: "oklch(0.82 0.10 240)",
    desc: "Amplifies neighbors. Best between power and links.",
    tags: ["Signal"],
    synergies: [
      { tag: "Power", positive: true },
      { tag: "Link", positive: true },
    ],
    cells: [[0, 0]],
  },
  {
    id: "conduit",
    name: "Conduit",
    glyph: "tri",
    color: "oklch(0.86 0.16 110)",
    desc: "L-shaped link. Pairs well with signal and storage.",
    tags: ["Signal", "Link"],
    synergies: [
      { tag: "Signal", positive: true },
      { tag: "Storage", positive: true },
    ],
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  },
  {
    id: "capacitor",
    name: "Capacitor",
    glyph: "rect",
    color: "oklch(0.78 0.13 25)",
    desc: "T-shaped storage. Penalty next to other storage.",
    tags: ["Storage"],
    synergies: [
      { tag: "Link", positive: true },
      { tag: "Power", positive: true },
      { tag: "Storage", positive: false },
    ],
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [1, 1],
    ],
  },
  {
    id: "sensor",
    name: "Sensor",
    glyph: "circle",
    color: "oklch(0.83 0.10 305)",
    desc: "Cheap. Bonus near most things, crowds badly with itself.",
    tags: ["Signal", "Sensor"],
    synergies: [
      { tag: "Power", positive: true },
      { tag: "Storage", positive: true },
      { tag: "Sensor", positive: false },
    ],
    cells: [[0, 0]],
  },
  {
    id: "shield",
    name: "Shield",
    glyph: "pent",
    color: "oklch(0.80 0.05 165)",
    desc: "Defensive L-shape. Boosts storage and power.",
    tags: ["Defense"],
    synergies: [
      { tag: "Storage", positive: true },
      { tag: "Power", positive: true },
    ],
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
    ],
  },
];

// Human-readable names for colors and glyphs
const COLOR_NAMES = {
  "oklch(0.78 0.12 195)": "Teal",
  "oklch(0.82 0.10 240)": "Blue",
  "oklch(0.86 0.16 110)": "Lime",
  "oklch(0.78 0.13 25)": "Red",
  "oklch(0.83 0.10 305)": "Violet",
  "oklch(0.80 0.05 165)": "Sage",
  "oklch(0.72 0.17 145)": "Green",
  "oklch(0.80 0.12 45)": "Amber",
};

const GLYPH_NAMES = {
  hex: "Hex",
  diamond: "Diamond",
  tri: "Triangle",
  rect: "Rectangle",
  circle: "Circle",
  pent: "Pentagon",
  star: "Star",
  cross: "Cross",
};

// Helper to get a random available combo
function getNextAvailableCombo(existingTypes) {
  const usedCombos = new Set(existingTypes.map(t => `${t.glyph}:${t.color}`));

  // Collect all available combos
  const available = [];
  for (const color of PREDEFINED_COLORS) {
    for (const glyph of PREDEFINED_GLYPHS) {
      const key = `${glyph}:${color}`;
      if (!usedCombos.has(key)) {
        available.push({ glyph, color, cells: DEFAULT_CELLS_FOR_GLYPH[glyph] || [[0, 0]] });
      }
    }
  }

  if (available.length === 0) return null;

  // Find which colors and glyphs are least used among existing types
  const usedColorCounts = {};
  const usedGlyphCounts = {};
  for (const t of existingTypes) {
    usedColorCounts[t.color] = (usedColorCounts[t.color] || 0) + 1;
    usedGlyphCounts[t.glyph] = (usedGlyphCounts[t.glyph] || 0) + 1;
  }

  // Prefer combos with least-used color and glyph for maximum contrast
  const minColorUse = Math.min(...available.map(c => usedColorCounts[c.color] || 0));
  const leastUsedColorCombos = available.filter(
    c => (usedColorCounts[c.color] || 0) === minColorUse,
  );

  const minGlyphUse = Math.min(...leastUsedColorCombos.map(c => usedGlyphCounts[c.glyph] || 0));
  const bestCombos = leastUsedColorCombos.filter(
    c => (usedGlyphCounts[c.glyph] || 0) === minGlyphUse,
  );

  // Random pick from the best candidates
  return bestCombos[Math.floor(Math.random() * bestCombos.length)];
}

// Check if we can create more objects
function canCreateNewObject(existingTypes) {
  return getNextAvailableCombo(existingTypes) !== null;
}

// Mutable runtime registry
let __TYPES = ITEM_TYPES.slice();
const ITEM_BY_ID = new Proxy(
  {},
  {
    get(_, key) {
      return __TYPES.find(t => t.id === key);
    },
    has(_, key) {
      return __TYPES.some(t => t.id === key);
    },
    ownKeys() {
      return __TYPES.map(t => t.id);
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    },
  },
);
function setRuntimeItemTypes(types) {
  __TYPES = types.slice();
}

const INITIAL_INVENTORY = {
  core: 6,
  relay: 5,
  conduit: 3,
  capacitor: 2,
  sensor: 8,
  shield: 3,
};

const INITIAL_PLACEMENTS = [
  { id: "p1", type: "core", x: 3, y: 3, rot: 0 },
  { id: "p2", type: "relay", x: 4, y: 3, rot: 0 },
  { id: "p3", type: "core", x: 5, y: 3, rot: 0 },
  { id: "p4", type: "sensor", x: 3, y: 4, rot: 0 },
  { id: "p5", type: "sensor", x: 5, y: 4, rot: 0 },
  { id: "p6", type: "conduit", x: 3, y: 5, rot: 0 },
  { id: "p7", type: "capacitor", x: 6, y: 3, rot: 0 },
  { id: "p8", type: "shield", x: 6, y: 6, rot: 0 },
];

// ---------- cell-shape helpers ----------

// Rotate an array of cell offsets by 0/90/180/270 degrees CW, normalizing to origin.
function rotateCells(baseCells, rot) {
  let cells = baseCells.map(c => [c[0], c[1]]);
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
function getShapeCells(p) {
  const t = ITEM_BY_ID[p.type];
  if (t && t.cells) return rotateCells(t.cells, p.rot);
  // Legacy fallback: rectangular from size
  const size = (t && t.size) || [1, 1];
  const [w, h] = p.rot % 180 === 0 ? size : [size[1], size[0]];
  const cells = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells.push([dx, dy]);
  return cells;
}

// Bounding-box dimensions of a placement's shape.
function getDims(p) {
  const cells = getShapeCells(p);
  const maxX = Math.max(...cells.map(c => c[0]));
  const maxY = Math.max(...cells.map(c => c[1]));
  return [maxX + 1, maxY + 1];
}

// Bounding-box of a type's base (unrotated) shape.
function getTypeSize(tt) {
  if (tt.cells) {
    const maxX = Math.max(...tt.cells.map(c => c[0]));
    const maxY = Math.max(...tt.cells.map(c => c[1]));
    return [maxX + 1, maxY + 1];
  }
  return tt.size || [1, 1];
}

// Absolute cell positions of a placement on the grid.
function cellsOf(p) {
  return getShapeCells(p).map(([dx, dy]) => [p.x + dx, p.y + dy]);
}

function occupancyMap(placements) {
  const map = new Map();
  for (const p of placements) {
    for (const [cx, cy] of cellsOf(p)) {
      map.set(`${cx},${cy}`, p.id);
    }
  }
  return map;
}

function fits(p, placements, gridW, gridH, ignoreId, disabledCells) {
  const cells = cellsOf(p);
  // Bounds check
  for (const [cx, cy] of cells) {
    if (cx < 0 || cy < 0 || cx >= gridW || cy >= gridH) return false;
  }
  // Occupancy + disabled check
  const occ = occupancyMap(placements.filter(q => q.id !== ignoreId));
  for (const [cx, cy] of cells) {
    if (occ.has(`${cx},${cy}`)) return false;
    if (disabledCells && disabledCells.has(`${cx},${cy}`)) return false;
  }
  return true;
}

function adjacent(a, b) {
  const cellsA = cellsOf(a);
  const cellsB = new Set(cellsOf(b).map(([x, y]) => `${x},${y}`));
  for (const [ax, ay] of cellsA) {
    if (cellsB.has(`${ax + 1},${ay}`)) return true;
    if (cellsB.has(`${ax - 1},${ay}`)) return true;
    if (cellsB.has(`${ax},${ay + 1}`)) return true;
    if (cellsB.has(`${ax},${ay - 1}`)) return true;
  }
  return false;
}

// Points `fromType` gains for being adjacent to `toType`: each of fromType's
// synergy rules whose tag appears in toType's tags contributes +1 (positive) or
// -1 (negative).
function tagSynergy(fromType, toType) {
  if (!fromType || !toType || !Array.isArray(fromType.synergies)) return 0;
  const tags = toType.tags;
  if (!tags || tags.length === 0) return 0;
  const tagSet = new Set(tags);
  let sum = 0;
  for (const s of fromType.synergies) {
    if (s && s.tag && tagSet.has(s.tag)) sum += s.positive === false ? -1 : 1;
  }
  return sum;
}

function calcScore(placements) {
  const perItem = {};
  for (const p of placements) {
    perItem[p.id] = { bonus: 0, total: 0, neighbors: [] };
  }
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i],
        b = placements[j];
      if (!adjacent(a, b)) continue;
      const ta = ITEM_BY_ID[a.type],
        tb = ITEM_BY_ID[b.type];
      const da = tagSynergy(ta, tb);
      const db = tagSynergy(tb, ta);
      perItem[a.id].bonus += da;
      perItem[b.id].bonus += db;
      perItem[a.id].neighbors.push({ id: b.id, type: b.type, delta: da });
      perItem[b.id].neighbors.push({ id: a.id, type: a.type, delta: db });
    }
  }
  let total = 0;
  for (const p of placements) {
    perItem[p.id].total = perItem[p.id].bonus;
    total += perItem[p.id].total;
  }
  return { perItem, total };
}

function findClusters(placements) {
  const ids = placements.map(p => p.id);
  const parent = Object.fromEntries(ids.map(id => [id, id]));
  const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => {
    parent[find(a)] = find(b);
  };
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      if (adjacent(placements[i], placements[j])) union(placements[i].id, placements[j].id);
    }
  }
  const groups = {};
  for (const id of ids) {
    const r = find(id);
    (groups[r] = groups[r] || []).push(id);
  }
  return Object.values(groups);
}

// Check if ALL placements fit within a given grid size.
function allPlacementsFit(placements, w, h) {
  for (const p of placements) {
    const cells = cellsOf(p);
    for (const [cx, cy] of cells) {
      if (cx >= w || cy >= h) return false;
    }
  }
  return true;
}

// Resize the grid to newW × newH, compacting placements toward the origin only
// as much as needed so a shrink can reclaim empty space on EITHER side. The grid
// always retracts from the right/bottom edges, so without this a shrink is blocked
// whenever something sits against the far edge even if there's slack on the near
// edge. We compute the occupied bounding box and shift everything left/up just
// enough that the far edge fits — never more, so a shrink that already has slack
// on the right/bottom doesn't move anything. Disabled cells shift with the
// placements (and drop if they fall outside). Returns null if the occupied span
// itself is wider/taller than the requested size (a true impossible shrink).
function resizeFit(placements, disabledCells, newW, newH) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of placements) {
    for (const [cx, cy] of cellsOf(p)) {
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
  // dx ≤ minX is guaranteed since occW ≤ newW, so nothing goes negative.
  const dx = hasItems ? Math.max(0, maxX - newW + 1) : 0;
  const dy = hasItems ? Math.max(0, maxY - newH + 1) : 0;
  const placementsOut =
    dx || dy ? placements.map(p => ({ ...p, x: p.x - dx, y: p.y - dy })) : placements;
  const disabledOut = new Set();
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

Object.assign(window, {
  ITEM_TYPES,
  ITEM_BY_ID,
  INITIAL_INVENTORY,
  INITIAL_PLACEMENTS,
  getDims,
  getTypeSize,
  cellsOf,
  occupancyMap,
  fits,
  adjacent,
  calcScore,
  findClusters,
  tagSynergy,
  setRuntimeItemTypes,
  getShapeCells,
  rotateCells,
  allPlacementsFit,
  resizeFit,
  getNextAvailableCombo,
  canCreateNewObject,
  MAX_OBJECT_TYPES,
  PREDEFINED_COLORS,
  PREDEFINED_GLYPHS,
  COLOR_NAMES,
  GLYPH_NAMES,
});
