import type { ItemType, Placement } from "./types";
import { rotateCells } from "./geometry";

// Count distinct normalized shapes among the 4 rotations of a cell list.
function distinctRotations(cells: [number, number][]): number {
  const seen = new Set<string>();
  for (let r = 0; r < 4; r++) {
    seen.add(JSON.stringify(rotateCells(cells, r * 90)));
  }
  return seen.size;
}

// Upper bound on the total number of distinct layouts: product over every
// placed item of (gridW * gridH * distinctRotations). Ignores overlaps, so
// the true count is always smaller, but this is fast and good enough for
// display. Returns 1 for an empty placement list.
export function upperBoundLayouts(
  itemTypes: ItemType[],
  placements: Placement[],
  gridW: number,
  gridH: number,
): bigint {
  const positions = BigInt(gridW * gridH);
  const byId = Object.fromEntries(itemTypes.map(t => [t.id, t]));
  return placements.reduce((acc, p) => {
    const tt = byId[p.type];
    const rots = BigInt(tt ? distinctRotations(tt.cells) : 1);
    return acc * positions * rots;
  }, 1n);
}

// Abbreviated display string for a potentially huge layout count.
export function formatBound(n: bigint): string {
  if (n <= 999_999n) return n.toString();
  const num = Number(n);
  if (num < 1e9) return `~${(num / 1e6).toFixed(1)}M`;
  if (num < 1e12) return `~${(num / 1e9).toFixed(1)}B`;
  return `~${num.toExponential(1)}`;
}

// Stable signature for the board's scoring-relevant composition. Stable under
// position/rotation changes; changes when the type multiset, grid size,
// disabled cells, or any placed type's cells/tags/synergies change. Used to
// decide whether to reset the visited set (init) or just reseat.
export function boardSignature(
  itemTypes: ItemType[],
  placements: Placement[],
  gridW: number,
  gridH: number,
  disabledCells: Set<string>,
): string {
  const byId = Object.fromEntries(itemTypes.map(t => [t.id, t]));

  // Sorted multiset of placed type ids.
  const typeMultiset = placements
    .map(p => p.type)
    .sort()
    .join(",");

  // Grid dimensions.
  const grid = `${gridW}x${gridH}`;

  // Sorted disabled-cell keys.
  const disabled = Array.from(disabledCells).sort().join("|");

  // Scoring-relevant fields for each type that has a placement, sorted by id.
  const placedTypeIds = [...new Set(placements.map(p => p.type))].sort();
  const typeDefs = placedTypeIds
    .map(id => {
      const tt = byId[id];
      if (!tt) return id;
      const sortedTags = [...tt.tags].sort();
      const sortedSynergies = [...tt.synergies].sort((a, b) => a.tag.localeCompare(b.tag));
      return `${id}:${JSON.stringify(tt.cells)}:${sortedTags.join(",")}:${JSON.stringify(sortedSynergies)}`;
    })
    .join(";");

  return `${typeMultiset}|${grid}|${disabled}|${typeDefs}`;
}
