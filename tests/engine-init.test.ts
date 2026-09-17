// initEngine's caching contract, with the generated wasm-bindgen glue mocked so
// instantiations can be counted. Kept out of engine-wasm.test.ts, whose
// beforeAll initializes the real engine and would mask the race entirely.
import { beforeEach, describe, expect, it, vi } from "vitest";

const glue = vi.hoisted(() => ({
  initCalls: 0,
  shouldFail: false,
  // Set while an init is in flight; call it to let that init resolve.
  release: null as null | (() => void),
}));

vi.mock("../crates/engine/pkg/engine", () => ({
  default: () => {
    glue.initCalls++;
    if (glue.shouldFail) return Promise.reject(new Error("wasm boom"));
    return new Promise<void>(resolve => {
      glue.release = () => resolve();
    });
  },
  score: () => ({ total: 0, perItem: [] }),
}));

beforeEach(() => {
  // wasm.ts caches at module scope, so each test needs a fresh copy.
  vi.resetModules();
  glue.initCalls = 0;
  glue.shouldFail = false;
  glue.release = null;
});

describe("initEngine", () => {
  it("instantiates once when two callers race the first init", async () => {
    const { initEngine } = await import("../src/engine/wasm");
    // Both calls happen before the first instantiation resolves: the old
    // boolean guard was only set after the await, so both got through.
    const first = initEngine();
    const second = initEngine();
    glue.release!();
    await Promise.all([first, second]);
    expect(glue.initCalls).toBe(1);
  });

  it("does not re-instantiate once initialized", async () => {
    const { initEngine } = await import("../src/engine/wasm");
    const first = initEngine();
    glue.release!();
    await first;
    await initEngine();
    expect(glue.initCalls).toBe(1);
  });

  it("clears the cache on failure so a later call can retry", async () => {
    const { initEngine } = await import("../src/engine/wasm");
    glue.shouldFail = true;
    await expect(initEngine()).rejects.toThrow(/wasm boom/);
    expect(glue.initCalls).toBe(1);

    glue.shouldFail = false;
    const retry = initEngine();
    glue.release!();
    await retry;
    expect(glue.initCalls).toBe(2);
  });

  it("engineScore refuses to run before a successful init", async () => {
    const { engineScore, initEngine } = await import("../src/engine/wasm");
    const layout = { itemTypes: [], gridW: 1, gridH: 1, placements: [] };
    expect(() => engineScore(layout)).toThrowError(/not initialized/);

    const pending = initEngine();
    // Still not ready while the instantiation is in flight.
    expect(() => engineScore(layout)).toThrowError(/not initialized/);
    glue.release!();
    await pending;
    expect(() => engineScore(layout)).not.toThrow();
  });
});
