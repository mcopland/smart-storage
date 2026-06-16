import { cellsOf } from "./geometry";
import type { Placement, TypesById } from "./types";

// Group placements into connected components of orthogonal adjacency (union-find).
// Builds a cell->placementId index once (O(cells)) then checks each cell's 4
// orthogonal neighbors, avoiding the O(n^2) all-pairs comparison.
export function findClusters(placements: Placement[], typesById: TypesById): string[][] {
  const ids = placements.map(p => p.id);
  const parent = Object.fromEntries(ids.map(id => [id, id]));
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: string, b: string) => {
    parent[find(a)] = find(b);
  };

  const cellOwner = new Map<string, string>();
  for (const p of placements) {
    for (const [cx, cy] of cellsOf(p, typesById)) {
      cellOwner.set(`${cx},${cy}`, p.id);
    }
  }

  for (const p of placements) {
    for (const [cx, cy] of cellsOf(p, typesById)) {
      for (const [nx, ny] of [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ] as [number, number][]) {
        const neighbor = cellOwner.get(`${nx},${ny}`);
        if (neighbor && neighbor !== p.id) union(p.id, neighbor);
      }
    }
  }

  const groups: Record<string, string[]> = {};
  for (const id of ids) {
    const r = find(id);
    (groups[r] = groups[r] || []).push(id);
  }
  return Object.values(groups);
}
