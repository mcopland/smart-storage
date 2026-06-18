export type Cell = [number, number];

export interface Synergy {
  tag: string;
  positive: boolean;
}

// What scoring and geometry need to know about an item type.
export interface ItemTypeCore {
  id: string;
  tags: string[];
  synergies: Synergy[];
  cells: Cell[];
}

// Full catalog entry, including display-only fields.
export interface ItemType extends ItemTypeCore {
  name: string;
  glyph: string;
  color: string;
  desc: string;
}

export type TypesById = Record<string, ItemTypeCore | undefined>;

// Same lookup but with the full catalog entries (display fields included).
export type CatalogById = Record<string, ItemType | undefined>;

export interface Placement {
  id: string;
  type: string;
  x: number;
  y: number;
  rot: number;
}

export interface NeighborEntry {
  id: string;
  type: string;
  delta: number;
}

export interface PerItemScore {
  bonus: number;
  // total equals bonus today; it exists as an extension point for future base scores or penalties.
  total: number;
  neighbors: NeighborEntry[];
}

export interface ScoreResult {
  total: number;
  perItem: Record<string, PerItemScore>;
}

export type Inventory = Record<string, number>;

export interface GridSize {
  w: number;
  h: number;
}
