import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BULLET } from "./panels/chars";

interface PanState {
  startX: number;
  startY: number;
  panX: number;
  panY: number;
  pointerId: number;
}

// PannableContainer: allows panning when zoomed in
export function PannableContainer({
  children,
  zoom,
  theme,
}: {
  children: ReactNode;
  zoom: number;
  theme: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panState = useRef<PanState | null>(null);

  const isZoomed = zoom > 100;

  // Reset pan when zoom drops to 100% or below, adjusted during render (the
  // sanctioned "derive state from props" pattern) rather than in an effect.
  const [prevZoomed, setPrevZoomed] = useState(isZoomed);
  if (prevZoomed !== isZoomed) {
    setPrevZoomed(isZoomed);
    if (!isZoomed) setPan({ x: 0, y: 0 });
  }

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!isZoomed) return;
      e.preventDefault();
      setPan(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    },
    [isZoomed],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isZoomed || !spaceHeld) return;
      if (e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        setIsPanning(true);
        panState.current = {
          startX: e.clientX,
          startY: e.clientY,
          panX: pan.x,
          panY: pan.y,
          pointerId: e.pointerId,
        };
        containerRef.current!.setPointerCapture(e.pointerId);
        // Mark that we're panning
        if (contentRef.current) {
          contentRef.current.setAttribute("data-panning", "true");
        }
      }
    },
    [isZoomed, spaceHeld, pan],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!panState.current) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - panState.current.startX;
    const dy = e.clientY - panState.current.startY;
    setPan({
      x: panState.current.panX + dx,
      y: panState.current.panY + dy,
    });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!panState.current) return;
    e.preventDefault();
    e.stopPropagation();

    // Remove panning marker
    if (contentRef.current) {
      contentRef.current.removeAttribute("data-panning");
    }

    panState.current = null;
    setIsPanning(false);
    if (containerRef.current) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }
  }, []);

  // Track spacebar key state
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const el = e.target as HTMLInputElement;
      const tag = el.tagName;
      const type = (el.type || "").toLowerCase();
      const isTextField =
        tag === "TEXTAREA"
        || (tag === "INPUT"
          && ["text", "number", "search", "email", "url", "password", "tel"].includes(type));
      if (isTextField) return;
      e.preventDefault();
      // Focus may be sitting on a control like the zoom slider; blur it so Space-to-pan
      // engages immediately instead of being swallowed by the focused input.
      if (tag === "INPUT" || tag === "BUTTON") el.blur();
      setSpaceHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const wasPanning = panState.current !== null;
        setSpaceHeld(false);
        // Cancel panning if space is released while panning
        if (panState.current) {
          // Remove panning marker
          if (contentRef.current) {
            contentRef.current.removeAttribute("data-panning");
          }
          // Prevent the pointerup from triggering grid selection
          if (containerRef.current && panState.current.pointerId != null) {
            containerRef.current.releasePointerCapture(panState.current.pointerId);
          }
          panState.current = null;
          setIsPanning(false);
          // Stop event propagation to prevent selection box
          if (wasPanning) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const isWarm = theme === "warm";

  // Determine cursor based on context
  const getCursor = () => {
    if (isPanning) return "grabbing";
    if (isZoomed && spaceHeld) return "grab";
    return "default";
  };

  return (
    <div
      ref={containerRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 0,
        overflow: "hidden",
        cursor: getCursor(),
        position: "relative",
        zIndex: 0,
      }}
    >
      <div
        ref={contentRef}
        style={{
          transform: isZoomed ? `translate(${pan.x}px, ${pan.y}px)` : "none",
          transition: isPanning ? "none" : "transform 0.2s ease-out",
          pointerEvents: spaceHeld ? "none" : "auto",
        }}
      >
        {children}
      </div>

      {/* Hint when zoomed */}
      {isZoomed && !isPanning && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "6px 12px",
            borderRadius: 6,
            background: isWarm ? "rgba(60,50,40,0.85)" : "rgba(20,26,35,0.85)",
            backdropFilter: "blur(8px)",
            color: isWarm ? "#fbf8f0" : "rgba(255,255,255,0.85)",
            font: "11px/1.4 Inter, system-ui, sans-serif",
            pointerEvents: "none",
            opacity: 0.7,
            transition: "opacity 0.3s ease",
          }}
        >
          Hold <strong>Space</strong> + drag to pan {BULLET} Scroll to pan
        </div>
      )}
    </div>
  );
}
