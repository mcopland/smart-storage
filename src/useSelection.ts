import { useCallback, useEffect, useState } from "react";

export function useSelection() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [highlightedTypeId, setHighlightedTypeId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const onSelectPlacements = useCallback((ids: string[]) => {
    setSelectedIds(ids);
    if (ids.length > 0) setSelectedTypeId(null);
  }, []);

  const onSelectTrayType = useCallback((id: string) => {
    setSelectedTypeId(prev => (prev === id ? null : id));
    setSelectedIds([]);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setSelectedTypeId(null);
  }, []);

  // Deselect the tray type when clicking outside tray items or the score panel.
  useEffect(() => {
    if (!selectedTypeId) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest("[data-tray-item]")) return;
      if (target.closest("[data-tray-panel]")) return;
      if (target.closest("[data-score-panel]")) return;
      setSelectedTypeId(null);
    };
    const timer = setTimeout(() => document.addEventListener("click", onClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", onClick);
    };
  }, [selectedTypeId]);

  // Deselect grid placements when clicking outside the grid or the score panel.
  useEffect(() => {
    if (selectedIds.length === 0) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest("[data-grid-surface]")) return;
      if (target.closest("[data-score-panel]")) return;
      setSelectedIds([]);
    };
    const timer = setTimeout(() => document.addEventListener("click", onClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", onClick);
    };
  }, [selectedIds]);

  return {
    selectedIds,
    setSelectedIds,
    selectedTypeId,
    setSelectedTypeId,
    highlightedTypeId,
    setHighlightedTypeId,
    hoveredId,
    setHoveredId,
    onSelectPlacements,
    onSelectTrayType,
    clearSelection,
  };
}
