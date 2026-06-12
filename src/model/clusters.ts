import { adjacent } from "./geometry";
import type { Placement, TypesById } from "./types";

// Group placements into connected components of orthogonal adjacency (union-find).
export function findClusters(placements: Placement[], typesById: TypesById): string[][] {
  const ids = placements.map(p => p.id);
  const parent = Object.fromEntries(ids.map(id => [id, id]));
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: string, b: string) => {
    parent[find(a)] = find(b);
  };
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      if (adjacent(placements[i], placements[j], typesById))
        union(placements[i].id, placements[j].id);
    }
  }
  const groups: Record<string, string[]> = {};
  for (const id of ids) {
    const r = find(id);
    (groups[r] = groups[r] || []).push(id);
  }
  return Object.values(groups);
}
