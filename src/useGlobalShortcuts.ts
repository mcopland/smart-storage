import { useEffect } from "react";
import type { TrayDrag } from "./components/grid/useTrayGhost";

// Window-level keyboard shortcuts: R rotates the selection (or the pending
// tray drag), Delete/Backspace deletes the selection (or prompts type
// deletion when a tray type is selected). Inputs and textareas are exempt.
export function useGlobalShortcuts({
  draggingFromTray,
  setDraggingFromTray,
  rotateSelection,
  deleteSelection,
  selectedTypeId,
  onDeleteType,
}: {
  draggingFromTray: TrayDrag | null;
  setDraggingFromTray: (update: (d: TrayDrag | null) => TrayDrag | null) => void;
  rotateSelection: () => void;
  deleteSelection: () => void;
  selectedTypeId: string | null;
  onDeleteType: (typeId: string) => void;
}): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as Element;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        if (draggingFromTray) {
          setDraggingFromTray(d => (d ? { ...d, rot: ((d.rot ?? 0) + 90) % 360 } : d));
        } else {
          rotateSelection();
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedTypeId) {
          onDeleteType(selectedTypeId);
        } else {
          deleteSelection();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    rotateSelection,
    deleteSelection,
    draggingFromTray,
    setDraggingFromTray,
    selectedTypeId,
    onDeleteType,
  ]);
}
