import type { Marquee } from "./useDragInteractions";

// The rubber-band selection rectangle drawn during a marquee drag.
export function MarqueeRect({ marquee, isWarm }: { marquee: Marquee; isWarm: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        left: Math.min(marquee.x0, marquee.x1),
        top: Math.min(marquee.y0, marquee.y1),
        width: Math.abs(marquee.x1 - marquee.x0),
        height: Math.abs(marquee.y1 - marquee.y0),
        border: `1px solid ${isWarm ? "rgba(60,50,40,0.4)" : "rgba(255,255,255,0.4)"}`,
        background: isWarm ? "rgba(60,50,40,0.06)" : "rgba(255,255,255,0.05)",
        pointerEvents: "none",
        borderRadius: 2,
      }}
    ></div>
  );
}
