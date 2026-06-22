import { useRef } from "react";
import { parseImportedLayout } from "./model/importLayout";
import type { GridSize, Inventory, ItemType, Placement } from "./model/types";

export interface LayoutSnapshot {
  gridSize: GridSize;
  placements: Placement[];
  disabledCells: Set<string>;
  itemTypes: ItemType[];
  inventory: Inventory;
  scoreTotal: number;
}

export interface LayoutPatch {
  gridSize?: GridSize;
  placements?: Placement[];
  disabledCells?: string[];
  itemTypes?: ItemType[];
  inventory?: Inventory;
}

export function useLayoutIO(
  snapshot: LayoutSnapshot,
  onApply: (patch: LayoutPatch) => void,
  onError: (msg: string) => void,
): {
  fileInputRef: React.RefObject<HTMLInputElement>;
  onImport: () => void;
  onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExport: () => void;
} {
  const fileInputRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>;

  const onImport = () => fileInputRef.current?.click();

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        console.error(`Import failed for "${file.name}": result is not a string`);
        onError(`Could not read "${file.name}": unexpected file content`);
        return;
      }
      try {
        const data = parseImportedLayout(reader.result, snapshot.itemTypes);
        onApply(data);
      } catch (err) {
        console.error(`Import failed for "${file.name}":`, err);
        onError(
          err instanceof Error
            ? `"${file.name}": ${err.message}`
            : `Could not import "${file.name}".`,
        );
      }
    };
    reader.onerror = () => {
      console.error(`FileReader error reading "${file.name}"`);
      onError(`Could not read "${file.name}"`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const onExport = () => {
    const data = {
      gridSize: snapshot.gridSize,
      placements: snapshot.placements,
      disabledCells: Array.from(snapshot.disabledCells),
      itemTypes: snapshot.itemTypes,
      inventory: snapshot.inventory,
      score: snapshot.scoreTotal,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "layout.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return { fileInputRef, onImport, onImportFile, onExport };
}
