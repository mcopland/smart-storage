import { useEffect, useRef, useState } from "react";

export function useGridSizing(
  gridW: number,
  gridH: number,
  gap: number,
  zoom: number,
): { containerRef: React.RefObject<HTMLElement>; cell: number; wsPad: number } {
  const containerRef = useRef<HTMLElement>(null) as React.RefObject<HTMLElement>;
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      if (r.width > 0 && r.height > 0) setContainerSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const wsPad = 18;
  const availW = containerSize.w - 64 - wsPad * 2 - 2;
  const availH = containerSize.h - 64 - wsPad * 2 - 2 - 70 - 42; // extra 42 for controls bar + label
  const baseCell = Math.max(
    12,
    Math.min(
      Math.floor((availW - (gridW - 1) * gap) / gridW),
      Math.floor((availH - (gridH - 1) * gap) / gridH),
    ),
  );
  const cell = Math.round(baseCell * (zoom / 100));

  return { containerRef, cell, wsPad };
}
