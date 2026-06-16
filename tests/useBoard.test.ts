import { describe, expect, it } from "vitest";
import { boardReducer } from "../src/useBoard";
import type { BoardState } from "../src/useBoard";
import type { Placement } from "../src/model/types";

const p = (id: string, type = "a"): Placement => ({ id, type, x: 0, y: 0, rot: 0 });

const base: BoardState = {
  placements: [],
  inventory: { a: 3, b: 1 },
};

describe("boardReducer -- setPlacements", () => {
  it("replaces placements wholesale", () => {
    const next = boardReducer(base, { type: "setPlacements", placements: [p("x")] });
    expect(next.placements).toEqual([p("x")]);
    expect(next.inventory).toEqual(base.inventory);
  });
});

describe("boardReducer -- setInventory", () => {
  it("replaces inventory wholesale", () => {
    const next = boardReducer(base, { type: "setInventory", inventory: { a: 0 } });
    expect(next.inventory).toEqual({ a: 0 });
    expect(next.placements).toEqual(base.placements);
  });
});

describe("boardReducer -- addPlacement", () => {
  it("appends placement and decrements stock when stock > 0", () => {
    const state: BoardState = { placements: [], inventory: { a: 2 } };
    const next = boardReducer(state, { type: "addPlacement", placement: p("p1") });
    expect(next.placements).toEqual([p("p1")]);
    expect(next.inventory.a).toBe(1);
  });

  it("appends placement and leaves stock at 0 when stock is 0 (mint)", () => {
    const state: BoardState = { placements: [], inventory: { a: 0 } };
    const next = boardReducer(state, { type: "addPlacement", placement: p("p1") });
    expect(next.placements).toEqual([p("p1")]);
    expect(next.inventory.a).toBe(0);
  });

  it("appends placement and leaves stock at 0 when type not in inventory", () => {
    const state: BoardState = { placements: [], inventory: {} };
    const next = boardReducer(state, { type: "addPlacement", placement: p("p1") });
    expect(next.placements).toEqual([p("p1")]);
    expect(next.inventory.a ?? 0).toBe(0);
  });
});

describe("boardReducer -- placeAll", () => {
  it("replaces placements and inventory atomically", () => {
    const next = boardReducer(base, {
      type: "placeAll",
      placements: [p("q1"), p("q2")],
      inventory: { a: 0, b: 0 },
    });
    expect(next.placements).toEqual([p("q1"), p("q2")]);
    expect(next.inventory).toEqual({ a: 0, b: 0 });
  });
});

describe("boardReducer -- removePlacements", () => {
  it("removes matching placements and returns them to inventory", () => {
    const state: BoardState = {
      placements: [p("p1", "a"), p("p2", "b"), p("p3", "a")],
      inventory: { a: 1, b: 0 },
    };
    const next = boardReducer(state, { type: "removePlacements", ids: ["p1", "p3"] });
    expect(next.placements).toEqual([p("p2", "b")]);
    // Two "a" placements returned -> a: 1 + 2 = 3
    expect(next.inventory.a).toBe(3);
    expect(next.inventory.b).toBe(0);
  });

  it("ignores ids that are not present", () => {
    const state: BoardState = { placements: [p("p1")], inventory: { a: 0 } };
    const next = boardReducer(state, { type: "removePlacements", ids: ["nonexistent"] });
    expect(next.placements).toEqual([p("p1")]);
    expect(next.inventory.a).toBe(0);
  });
});

describe("boardReducer -- setStock", () => {
  it("sets inventory count for a type", () => {
    const next = boardReducer(base, { type: "setStock", typeId: "a", n: 7 });
    expect(next.inventory.a).toBe(7);
  });

  it("clamps to 0 on the low end", () => {
    const next = boardReducer(base, { type: "setStock", typeId: "a", n: -5 });
    expect(next.inventory.a).toBe(0);
  });

  it("clamps to 999 on the high end", () => {
    const next = boardReducer(base, { type: "setStock", typeId: "a", n: 1234 });
    expect(next.inventory.a).toBe(999);
  });

  it("rounds fractional values", () => {
    const next = boardReducer(base, { type: "setStock", typeId: "a", n: 2.7 });
    expect(next.inventory.a).toBe(3);
  });
});

describe("boardReducer -- addStock", () => {
  it("adds to an existing inventory key", () => {
    const next = boardReducer(base, { type: "addStock", typeId: "a", count: 2 });
    expect(next.inventory.a).toBe(5);
  });

  it("initialises a missing key", () => {
    const next = boardReducer(base, { type: "addStock", typeId: "new", count: 3 });
    expect(next.inventory.new).toBe(3);
  });
});

describe("boardReducer -- removeType", () => {
  it("drops placements of that type and deletes the inventory key", () => {
    const state: BoardState = {
      placements: [p("p1", "a"), p("p2", "b"), p("p3", "a")],
      inventory: { a: 1, b: 2 },
    };
    const next = boardReducer(state, { type: "removeType", typeId: "a" });
    expect(next.placements).toEqual([p("p2", "b")]);
    expect("a" in next.inventory).toBe(false);
    expect(next.inventory.b).toBe(2);
  });

  it("does NOT return removed placements to stock", () => {
    const state: BoardState = {
      placements: [p("p1", "a")],
      inventory: { a: 0 },
    };
    const next = boardReducer(state, { type: "removeType", typeId: "a" });
    expect("a" in next.inventory).toBe(false);
  });
});

describe("boardReducer -- applyBoard", () => {
  it("replaces only provided slices", () => {
    const state: BoardState = {
      placements: [p("old")],
      inventory: { a: 5 },
    };
    const next = boardReducer(state, {
      type: "applyBoard",
      placements: [p("new")],
    });
    expect(next.placements).toEqual([p("new")]);
    expect(next.inventory).toEqual({ a: 5 });
  });

  it("replaces inventory only when provided", () => {
    const state: BoardState = {
      placements: [p("x")],
      inventory: { a: 2 },
    };
    const next = boardReducer(state, {
      type: "applyBoard",
      inventory: { b: 9 },
    });
    expect(next.placements).toEqual([p("x")]);
    expect(next.inventory).toEqual({ b: 9 });
  });
});
