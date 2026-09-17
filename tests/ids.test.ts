import { describe, expect, it } from "vitest";
import { newPlacementId, newTypeId } from "../src/model/ids";

describe("newPlacementId", () => {
  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newPlacementId()));
    expect(ids.size).toBe(100);
  });
});

describe("newTypeId", () => {
  it("slugifies the name", () => {
    expect(newTypeId("Red Hexagon", [])).toBe("red_hexagon");
  });

  it("collapses punctuation and trims separators", () => {
    expect(newTypeId("  Power//Relay!  ", [])).toBe("power_relay");
  });

  it("falls back to a stable prefix for a name with no usable characters", () => {
    expect(newTypeId("!!!", [])).toBe("type");
  });

  it("suffixes when the slug is already taken", () => {
    expect(newTypeId("Red Hexagon", ["red_hexagon"])).toBe("red_hexagon_2");
  });

  it("keeps stepping past a run of taken ids", () => {
    const taken: string[] = [];
    for (let i = 0; i < 5; i++) taken.push(newTypeId("Core", taken));
    expect(taken).toEqual(["core", "core_2", "core_3", "core_4", "core_5"]);
  });

  it("is unaffected by unrelated existing ids", () => {
    expect(newTypeId("Relay", ["core", "conduit"])).toBe("relay");
  });
});
