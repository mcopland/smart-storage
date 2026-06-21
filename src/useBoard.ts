import { useCallback, useReducer } from "react";
import type { Inventory, Placement } from "./model/types";

export interface BoardState {
  placements: Placement[];
  inventory: Inventory;
}

export type BoardAction =
  | { type: "setPlacements"; placements: Placement[] }
  | { type: "setInventory"; inventory: Inventory }
  | { type: "addPlacement"; placement: Placement }
  | { type: "placeAll"; placements: Placement[]; inventory: Inventory }
  | { type: "removePlacements"; ids: string[] }
  | { type: "setStock"; typeId: string; n: number }
  | { type: "addStock"; typeId: string; count: number }
  | { type: "removeType"; typeId: string }
  | { type: "applyBoard"; placements?: Placement[]; inventory?: Inventory };

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case "setPlacements":
      return { ...state, placements: action.placements };

    case "setInventory":
      return { ...state, inventory: action.inventory };

    case "addPlacement": {
      const typeId = action.placement.type;
      const cur = state.inventory[typeId] ?? 0;
      return {
        placements: [...state.placements, action.placement],
        inventory: cur > 0 ? { ...state.inventory, [typeId]: cur - 1 } : state.inventory,
      };
    }

    case "placeAll":
      return { placements: action.placements, inventory: action.inventory };

    case "removePlacements": {
      const idSet = new Set(action.ids);
      const removed = state.placements.filter(p => idSet.has(p.id));
      const returned: Inventory = {};
      for (const p of removed) {
        returned[p.type] = (returned[p.type] ?? 0) + 1;
      }
      const nextInventory = { ...state.inventory };
      for (const [typeId, count] of Object.entries(returned)) {
        nextInventory[typeId] = (nextInventory[typeId] ?? 0) + count;
      }
      return {
        placements: state.placements.filter(p => !idSet.has(p.id)),
        inventory: nextInventory,
      };
    }

    case "setStock":
      return {
        ...state,
        inventory: {
          ...state.inventory,
          [action.typeId]: Math.max(0, Math.min(999, Math.round(action.n))),
        },
      };

    case "addStock":
      return {
        ...state,
        inventory: {
          ...state.inventory,
          [action.typeId]: (state.inventory[action.typeId] ?? 0) + action.count,
        },
      };

    case "removeType": {
      const nextInventory = { ...state.inventory };
      delete nextInventory[action.typeId];
      return {
        placements: state.placements.filter(p => p.type !== action.typeId),
        inventory: nextInventory,
      };
    }

    case "applyBoard":
      return {
        placements: action.placements ?? state.placements,
        inventory: action.inventory ?? state.inventory,
      };
  }
}

export interface BoardActions {
  setPlacements: (placements: Placement[]) => void;
  setInventory: (inventory: Inventory) => void;
  addPlacement: (placement: Placement) => void;
  placeAll: (placements: Placement[], inventory: Inventory) => void;
  removePlacements: (ids: string[]) => void;
  setStock: (typeId: string, n: number) => void;
  addStock: (typeId: string, count: number) => void;
  removeType: (typeId: string) => void;
  applyBoard: (patch: { placements?: Placement[]; inventory?: Inventory }) => void;
}

export function useBoard(initial: BoardState): [BoardState, BoardActions] {
  const [state, dispatch] = useReducer(boardReducer, initial);

  const actions: BoardActions = {
    setPlacements: useCallback(
      (placements: Placement[]) => dispatch({ type: "setPlacements", placements }),
      [],
    ),
    setInventory: useCallback(
      (inventory: Inventory) => dispatch({ type: "setInventory", inventory }),
      [],
    ),
    addPlacement: useCallback(
      (placement: Placement) => dispatch({ type: "addPlacement", placement }),
      [],
    ),
    placeAll: useCallback(
      (placements: Placement[], inventory: Inventory) =>
        dispatch({ type: "placeAll", placements, inventory }),
      [],
    ),
    removePlacements: useCallback(
      (ids: string[]) => dispatch({ type: "removePlacements", ids }),
      [],
    ),
    setStock: useCallback(
      (typeId: string, n: number) => dispatch({ type: "setStock", typeId, n }),
      [],
    ),
    addStock: useCallback(
      (typeId: string, count: number) => dispatch({ type: "addStock", typeId, count }),
      [],
    ),
    removeType: useCallback((typeId: string) => dispatch({ type: "removeType", typeId }), []),
    applyBoard: useCallback(
      (patch: { placements?: Placement[]; inventory?: Inventory }) =>
        dispatch({ type: "applyBoard", ...patch }),
      [],
    ),
  };

  return [state, actions];
}
