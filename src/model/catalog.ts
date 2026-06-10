import type { Cell, Inventory, ItemType, Placement } from "./types";

// 8 highly contrasting colors x 8 recognizable glyphs = 64 unique combos
export const PREDEFINED_COLORS = [
  "oklch(0.78 0.12 195)", // teal
  "oklch(0.82 0.10 240)", // blue
  "oklch(0.86 0.16 110)", // lime
  "oklch(0.78 0.13 25)", // red-orange
  "oklch(0.83 0.10 305)", // violet
  "oklch(0.80 0.05 165)", // sage
  "oklch(0.72 0.17 145)", // green
  "oklch(0.80 0.12 45)", // amber
];

export const PREDEFINED_GLYPHS = [
  "hex",
  "diamond",
  "tri",
  "rect",
  "circle",
  "pent",
  "star",
  "cross",
];

// Default cells for each glyph when auto-assigning
export const DEFAULT_CELLS_FOR_GLYPH: Record<string, Cell[]> = {
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

export const MAX_OBJECT_TYPES = PREDEFINED_COLORS.length * PREDEFINED_GLYPHS.length; // 64

// Objects carry `tags` (what they ARE) and `synergies` (tag-based rules: each is
// simply positive (bonus) or negative (penalty) toward objects carrying a given
// tag). There is no base score: an object's score is purely the sum of its
// synergy connections, each worth +1 or -1.
export const ITEM_TYPES: ItemType[] = [
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
export const COLOR_NAMES: Record<string, string> = {
  "oklch(0.78 0.12 195)": "Teal",
  "oklch(0.82 0.10 240)": "Blue",
  "oklch(0.86 0.16 110)": "Lime",
  "oklch(0.78 0.13 25)": "Red",
  "oklch(0.83 0.10 305)": "Violet",
  "oklch(0.80 0.05 165)": "Sage",
  "oklch(0.72 0.17 145)": "Green",
  "oklch(0.80 0.12 45)": "Amber",
};

export const GLYPH_NAMES: Record<string, string> = {
  hex: "Hex",
  diamond: "Diamond",
  tri: "Triangle",
  rect: "Rectangle",
  circle: "Circle",
  pent: "Pentagon",
  star: "Star",
  cross: "Cross",
};

export interface Combo {
  glyph: string;
  color: string;
  cells: Cell[];
}

// Helper to get a random available combo
export function getNextAvailableCombo(existingTypes: ItemType[]): Combo | null {
  const usedCombos = new Set(existingTypes.map(t => `${t.glyph}:${t.color}`));

  // Collect all available combos
  const available: Combo[] = [];
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
  const usedColorCounts: Record<string, number> = {};
  const usedGlyphCounts: Record<string, number> = {};
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
export function canCreateNewObject(existingTypes: ItemType[]): boolean {
  return getNextAvailableCombo(existingTypes) !== null;
}

export const INITIAL_INVENTORY: Inventory = {
  core: 6,
  relay: 5,
  conduit: 3,
  capacitor: 2,
  sensor: 8,
  shield: 3,
};

export const INITIAL_PLACEMENTS: Placement[] = [
  { id: "p1", type: "core", x: 3, y: 3, rot: 0 },
  { id: "p2", type: "relay", x: 4, y: 3, rot: 0 },
  { id: "p3", type: "core", x: 5, y: 3, rot: 0 },
  { id: "p4", type: "sensor", x: 3, y: 4, rot: 0 },
  { id: "p5", type: "sensor", x: 5, y: 4, rot: 0 },
  { id: "p6", type: "conduit", x: 3, y: 5, rot: 0 },
  { id: "p7", type: "capacitor", x: 6, y: 3, rot: 0 },
  { id: "p8", type: "shield", x: 6, y: 6, rot: 0 },
];
