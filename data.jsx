// data.jsx — item catalog with cell-based shapes, adjacency rules, layout helpers

const ITEM_TYPES = [
  {
    id: "core",
    name: "Core",
    glyph: "hex",
    color: "oklch(0.78 0.12 195)",
    base: 12,
    desc: "Foundation unit. Strong with itself in clusters.",
    synergy: { core: 4, relay: 2 },
    cells: [[0, 0]],
  },
  {
    id: "relay",
    name: "Relay",
    glyph: "diamond",
    color: "oklch(0.82 0.10 240)",
    base: 8,
    desc: "Amplifies neighbors. Best between two cores.",
    synergy: { core: 3, conduit: 3 },
    cells: [[0, 0]],
  },
  {
    id: "conduit",
    name: "Conduit",
    glyph: "tri",
    color: "oklch(0.85 0.11 95)",
    base: 6,
    desc: "L-shaped link. Pairs well with relays.",
    synergy: { relay: 4, capacitor: 2 },
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
    base: 14,
    desc: "T-shaped storage. Penalty next to other capacitors.",
    synergy: { conduit: 4, core: 2, capacitor: -3 },
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
    base: 5,
    desc: "Cheap. Bonus when next to anything but itself.",
    synergy: { core: 2, relay: 2, conduit: 2, capacitor: 3, sensor: -1 },
    cells: [[0, 0]],
  },
  {
    id: "shield",
    name: "Shield",
    glyph: "pent",
    color: "oklch(0.84 0.07 165)",
    base: 9,
    desc: "Defensive L-shape. Boosts capacitors and cores.",
    synergy: { capacitor: 4, core: 3 },
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
    ],
  },
];

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

function calcScore(placements) {
  const perItem = {};
  for (const p of placements) {
    const t = ITEM_BY_ID[p.type];
    perItem[p.id] = { base: t.base, bonus: 0, total: t.base, neighbors: [] };
  }
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i],
        b = placements[j];
      if (!adjacent(a, b)) continue;
      const ta = ITEM_BY_ID[a.type],
        tb = ITEM_BY_ID[b.type];
      const da = ta.synergy[b.type] ?? 0;
      const db = tb.synergy[a.type] ?? 0;
      perItem[a.id].bonus += da;
      perItem[b.id].bonus += db;
      perItem[a.id].neighbors.push({ id: b.id, type: b.type, delta: da });
      perItem[b.id].neighbors.push({ id: a.id, type: a.type, delta: db });
    }
  }
  let total = 0;
  for (const p of placements) {
    perItem[p.id].total = perItem[p.id].base + perItem[p.id].bonus;
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
  setRuntimeItemTypes,
  getShapeCells,
  rotateCells,
  allPlacementsFit,
});
