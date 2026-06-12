import { describe, expect, it } from "vitest";
import {
  canCreateNewObject,
  getNextAvailableCombo,
  ITEM_TYPES,
  MAX_OBJECT_TYPES,
  PREDEFINED_COLORS,
  PREDEFINED_GLYPHS,
} from "../src/model/catalog";
import type { ItemType } from "../src/model/types";

describe("getNextAvailableCombo", () => {
  it("never returns a combo already in use", () => {
    const combo = getNextAvailableCombo(ITEM_TYPES);
    expect(combo).not.toBeNull();
    const used = new Set(ITEM_TYPES.map(t => `${t.glyph}:${t.color}`));
    expect(used.has(`${combo!.glyph}:${combo!.color}`)).toBe(false);
  });

  it("prefers colors not used by any existing type", () => {
    const combo = getNextAvailableCombo(ITEM_TYPES);
    const usedColors = new Set(ITEM_TYPES.map(t => t.color));
    expect(usedColors.has(combo!.color)).toBe(false);
  });

  it("returns null when all 64 combos are taken", () => {
    const all: ItemType[] = [];
    for (const color of PREDEFINED_COLORS) {
      for (const glyph of PREDEFINED_GLYPHS) {
        all.push({
          id: `${glyph}-${color}`,
          name: "x",
          glyph,
          color,
          desc: "",
          tags: [],
          synergies: [],
          cells: [[0, 0]],
        });
      }
    }
    expect(all).toHaveLength(MAX_OBJECT_TYPES);
    expect(getNextAvailableCombo(all)).toBeNull();
    expect(canCreateNewObject(all)).toBe(false);
  });

  it("supplies default cells for the chosen glyph", () => {
    const combo = getNextAvailableCombo([]);
    expect(combo!.cells.length).toBeGreaterThan(0);
  });
});
