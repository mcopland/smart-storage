// @vitest-environment happy-dom
// Tests useOptimizer with a mocked optimizer client: the init-vs-reseat
// decision on boardSignature changes, the mid-run reseat guard, terminal
// bestLayouts handling, Prev/Next tied-layout cycling, and error reporting.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OptimizerProgress } from "../src/engine/optimizerSession";
import type { ItemType, Placement } from "../src/model/types";
import { useOptimizer } from "../src/useOptimizer";

const mock = vi.hoisted(() => {
  const client = {
    init: vi.fn(),
    run: vi.fn(),
    pause: vi.fn(),
    reseat: vi.fn(),
    dispose: vi.fn(),
  };
  // Replaced with the hook's real callbacks when it creates the client;
  // the placeholders throw if a test emits before that.
  const callbacks = {
    onProgress: (_p: OptimizerProgress): void => {
      throw new Error("optimizer client not created yet");
    },
    onError: (_m: string): void => {
      throw new Error("optimizer client not created yet");
    },
  };
  return { client, callbacks };
});

vi.mock("../src/engine/optimizer", () => ({
  createOptimizerClient: (
    onProgress: (p: OptimizerProgress) => void,
    onError: (m: string) => void,
  ) => {
    mock.callbacks.onProgress = onProgress;
    mock.callbacks.onError = onError;
    return mock.client;
  },
}));

const itemTypes: ItemType[] = [
  {
    id: "a",
    name: "A",
    glyph: "a",
    color: "#111111",
    desc: "",
    tags: ["x"],
    synergies: [{ tag: "x", positive: true }],
    cells: [[0, 0]],
  },
  {
    id: "b",
    name: "B",
    glyph: "b",
    color: "#222222",
    desc: "",
    tags: ["x"],
    synergies: [{ tag: "x", positive: true }],
    cells: [[0, 0]],
  },
];

const basePlacements: Placement[] = [
  { id: "p0", type: "a", x: 0, y: 0, rot: 0 },
  { id: "p1", type: "b", x: 4, y: 0, rot: 0 },
];

function makeProgress(overrides: Partial<OptimizerProgress> = {}): OptimizerProgress {
  return {
    placements: basePlacements,
    score: 0,
    done: false,
    itersDone: 100,
    explored: 5,
    stalled: false,
    bestLayoutCount: 1,
    upperBound: 2,
    provablyOptimal: false,
    ...overrides,
  };
}

interface HookProps {
  placements: Placement[];
  itemTypes: ItemType[];
  gridW: number;
  gridH: number;
  disabledCells: Set<string>;
}

function renderOptimizer(initial?: Partial<HookProps>) {
  const onStart = vi.fn();
  const onProgress = vi.fn();
  const onError = vi.fn();
  const view = renderHook(
    (props: HookProps) => useOptimizer({ ...props, onStart, onProgress, onError }),
    {
      initialProps: {
        placements: basePlacements,
        itemTypes,
        gridW: 5,
        gridH: 1,
        disabledCells: new Set<string>(),
        ...initial,
      },
    },
  );
  return { ...view, onStart, onProgress, onError };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("session sync: init vs reseat", () => {
  it("inits a fresh session on first mount and passes the full layout", () => {
    renderOptimizer();
    expect(mock.client.init).toHaveBeenCalledTimes(1);
    expect(mock.client.reseat).not.toHaveBeenCalled();
    const [layout] = mock.client.init.mock.calls[0];
    expect(layout).toMatchObject({ gridW: 5, gridH: 1, placements: basePlacements });
  });

  it("does not init while the board is empty", () => {
    renderOptimizer({ placements: [] });
    expect(mock.client.init).not.toHaveBeenCalled();
    expect(mock.client.reseat).not.toHaveBeenCalled();
  });

  it("reseats (keeping the visited set) when only positions change", () => {
    const { rerender } = renderOptimizer();
    const moved = [
      { id: "p0", type: "a", x: 1, y: 0, rot: 0 },
      { id: "p1", type: "b", x: 3, y: 0, rot: 0 },
    ];
    rerender({
      placements: moved,
      itemTypes,
      gridW: 5,
      gridH: 1,
      disabledCells: new Set<string>(),
    });
    expect(mock.client.init).toHaveBeenCalledTimes(1);
    expect(mock.client.reseat).toHaveBeenCalledTimes(1);
    expect(mock.client.reseat.mock.calls[0][0].placements).toEqual(moved);
  });

  it("re-inits and resets stats when the composition changes", () => {
    const { result, rerender } = renderOptimizer();
    act(() => mock.callbacks.onProgress(makeProgress({ explored: 42 })));
    expect(result.current.explored).toBe(42);

    // Same grid, one more item of an existing type: signature changes.
    rerender({
      placements: [...basePlacements, { id: "p2", type: "a", x: 2, y: 0, rot: 0 }],
      itemTypes,
      gridW: 5,
      gridH: 1,
      disabledCells: new Set<string>(),
    });
    expect(mock.client.init).toHaveBeenCalledTimes(2);
    expect(mock.client.reseat).not.toHaveBeenCalled();
    expect(result.current.explored).toBe(0);
    expect(result.current.upperBound).toBeNull();
    expect(result.current.bestLayouts).toEqual([]);
  });

  it("neither inits nor reseats while a run is in progress", () => {
    const { result, rerender } = renderOptimizer();
    act(() => result.current.onOptimize());
    expect(result.current.optimizing).toBe(true);

    // Worker-driven placement updates land as prop changes mid-run.
    rerender({
      placements: [
        { id: "p0", type: "a", x: 2, y: 0, rot: 0 },
        { id: "p1", type: "b", x: 3, y: 0, rot: 0 },
      ],
      itemTypes,
      gridW: 5,
      gridH: 1,
      disabledCells: new Set<string>(),
    });
    expect(mock.client.init).toHaveBeenCalledTimes(1);
    expect(mock.client.reseat).not.toHaveBeenCalled();
  });

  it("reseats once the run finishes so the session tracks the final board", () => {
    const { result } = renderOptimizer();
    act(() => result.current.onOptimize());
    act(() =>
      mock.callbacks.onProgress(makeProgress({ done: true, bestLayouts: [basePlacements] })),
    );
    expect(result.current.optimizing).toBe(false);
    // The board-sync effect re-fires after `optimizing` flips false.
    expect(mock.client.reseat).toHaveBeenCalledTimes(1);
    expect(mock.client.init).toHaveBeenCalledTimes(1);
  });
});

describe("run lifecycle", () => {
  it("onOptimize starts a run: clears layouts, notifies onStart, forwards progress", () => {
    const { result, onStart, onProgress } = renderOptimizer();
    act(() => result.current.onOptimize());
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(mock.client.run).toHaveBeenCalledTimes(1);
    expect(result.current.optimizing).toBe(true);

    const moved = [
      { id: "p0", type: "a", x: 1, y: 0, rot: 0 },
      { id: "p1", type: "b", x: 2, y: 0, rot: 0 },
    ];
    act(() =>
      mock.callbacks.onProgress(makeProgress({ placements: moved, score: 2, explored: 10 })),
    );
    expect(onProgress).toHaveBeenLastCalledWith(moved);
    expect(result.current.explored).toBe(10);
    expect(result.current.optimizing).toBe(true);
  });

  it("onOptimize while running pauses instead", () => {
    const { result } = renderOptimizer();
    act(() => result.current.onOptimize());
    act(() => result.current.onOptimize());
    expect(mock.client.pause).toHaveBeenCalledTimes(1);
    expect(mock.client.run).toHaveBeenCalledTimes(1);
    expect(result.current.optimizing).toBe(false);
  });

  it("does not start a run on an empty board", () => {
    const { result } = renderOptimizer({ placements: [] });
    act(() => result.current.onOptimize());
    expect(mock.client.run).not.toHaveBeenCalled();
    expect(result.current.optimizing).toBe(false);
  });

  it("terminal progress stores bestLayouts and stops optimizing", () => {
    const { result } = renderOptimizer();
    act(() => result.current.onOptimize());
    const tied = [basePlacements, [...basePlacements].reverse()];
    act(() =>
      mock.callbacks.onProgress(
        makeProgress({
          done: true,
          score: 2,
          bestLayoutCount: 2,
          bestLayouts: tied,
          provablyOptimal: true,
        }),
      ),
    );
    expect(result.current.optimizing).toBe(false);
    expect(result.current.bestLayouts).toEqual(tied);
    expect(result.current.layoutIndex).toBe(0);
    expect(result.current.provablyOptimal).toBe(true);
  });

  it("reports worker errors through onError and stops optimizing", () => {
    const { result, onError } = renderOptimizer();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => result.current.onOptimize());
    act(() => mock.callbacks.onError("boom"));
    consoleError.mockRestore();
    expect(onError).toHaveBeenCalledWith("Optimize failed: boom");
    expect(result.current.optimizing).toBe(false);
  });
});

describe("tied-layout browsing", () => {
  const tied: Placement[][] = [
    [{ id: "p0", type: "a", x: 0, y: 0, rot: 0 }],
    [{ id: "p0", type: "a", x: 1, y: 0, rot: 0 }],
    [{ id: "p0", type: "a", x: 2, y: 0, rot: 0 }],
  ];

  function renderWithTied() {
    const view = renderOptimizer();
    act(() => view.result.current.onOptimize());
    act(() =>
      mock.callbacks.onProgress(
        makeProgress({ done: true, bestLayoutCount: 3, bestLayouts: tied }),
      ),
    );
    view.onProgress.mockClear();
    return view;
  }

  it("Next cycles forward with wrap-around and applies each layout", () => {
    const { result, onProgress } = renderWithTied();
    act(() => result.current.onNextLayout());
    expect(result.current.layoutIndex).toBe(1);
    expect(onProgress).toHaveBeenLastCalledWith(tied[1]);
    act(() => result.current.onNextLayout());
    act(() => result.current.onNextLayout());
    expect(result.current.layoutIndex).toBe(0);
    expect(onProgress).toHaveBeenLastCalledWith(tied[0]);
  });

  it("Prev cycles backward with wrap-around", () => {
    const { result, onProgress } = renderWithTied();
    act(() => result.current.onPrevLayout());
    expect(result.current.layoutIndex).toBe(2);
    expect(onProgress).toHaveBeenLastCalledWith(tied[2]);
  });

  it("is a no-op with fewer than two tied layouts", () => {
    const { result, onProgress } = renderOptimizer();
    act(() => result.current.onOptimize());
    act(() => mock.callbacks.onProgress(makeProgress({ done: true, bestLayouts: [tied[0]] })));
    onProgress.mockClear();
    act(() => result.current.onNextLayout());
    act(() => result.current.onPrevLayout());
    expect(result.current.layoutIndex).toBe(0);
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe("worker lifetime", () => {
  it("disposes the worker on unmount", () => {
    const { unmount } = renderOptimizer();
    unmount();
    expect(mock.client.dispose).toHaveBeenCalledTimes(1);
  });
});
