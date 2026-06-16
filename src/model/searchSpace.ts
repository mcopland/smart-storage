import type { ItemType, Placement } from "./types";

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
