import { adjacent } from "./geometry";
import type { ItemTypeCore, Placement, ScoreResult, TypesById } from "./types";

// Points `fromType` gains for being adjacent to `toType`: each of fromType's
// synergy rules whose tag appears in toType's tags contributes +1 (positive) or
// -1 (negative).
export function tagSynergy(
  fromType: ItemTypeCore | undefined,
  toType: ItemTypeCore | undefined,
): number {
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

export function calcScore(placements: Placement[], typesById: TypesById): ScoreResult {
  const perItem: ScoreResult["perItem"] = {};
  for (const p of placements) {
    perItem[p.id] = { bonus: 0, total: 0, neighbors: [] };
  }
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i],
        b = placements[j];
      if (!adjacent(a, b, typesById)) continue;
      const ta = typesById[a.type],
        tb = typesById[b.type];
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

export function findClusters(placements: Placement[], typesById: TypesById): string[][] {
  const ids = placements.map(p => p.id);
  const parent = Object.fromEntries(ids.map(id => [id, id]));
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: string, b: string) => {
    parent[find(a)] = find(b);
  };
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      if (adjacent(placements[i], placements[j], typesById)) union(placements[i].id, placements[j].id);
    }
  }
  const groups: Record<string, string[]> = {};
  for (const id of ids) {
    const r = find(id);
    (groups[r] = groups[r] || []).push(id);
  }
  return Object.values(groups);
}
