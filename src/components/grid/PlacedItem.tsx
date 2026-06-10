import { getDims, getShapeCells } from "../../model/geometry";
import type { CatalogById, Placement } from "../../model/types";
import { Glyph } from "../Glyph";
import { glyphBox, pickGlyphCell, shapeOutlinePath } from "./shapeOutline";

export interface PlacedItemProps {
  p: Placement;
  cell: number;
  gap: number;
  selected: boolean;
  score?: number;
  vizMode: string;
  onPointerDown: (e: React.PointerEvent, p: Placement) => void;
  onHoverEnter?: (p: Placement) => void;
  onHoverLeave?: () => void;
  theme: string;
  iconStyle: "solid" | "glyph";
  highlighted: boolean;
  highlightStyle?: string;
  focusActive?: boolean;
  typesById: CatalogById;
}

// Placed item rendered on grid (cell-by-cell for complex shapes)
export function PlacedItem({
  p,
  cell,
  gap,
  selected,
  score,
  vizMode,
  onPointerDown,
  onHoverEnter,
  onHoverLeave,
  theme,
  iconStyle,
  highlighted,
  highlightStyle = "halo",
  focusActive = false,
  typesById,
}: PlacedItemProps) {
  const t = typesById[p.type];
  if (!t) throw new Error(`PlacedItem: unknown item type "${p.type}" for placement "${p.id}"`);
  const shapeCells = getShapeCells(p, typesById);
  const [bw, bh] = getDims(p, typesById);
  const [gx, gy] = pickGlyphCell(shapeCells);
  const left = p.x * (cell + gap);
  const top = p.y * (cell + gap);
  const totalW = bw * cell + (bw - 1) * gap;
  const totalH = bh * cell + (bh - 1) * gap;

  const itemColor = t.color;
  const isWarm = theme === "warm";
  // Fill each shape with a light shade of its own color so types are easy to tell
  // apart; outline with the full assigned color.
  const surface = isWarm
    ? `color-mix(in oklab, ${itemColor} 24%, #ffffff)`
    : `color-mix(in oklab, ${itemColor} 30%, #0e1116)`;
  const borderCol = itemColor;

  const isFocused = selected || highlighted;
  // translucent shade of the item color, valid for oklch() inputs
  const glow = (pct: number) => `color-mix(in oklab, ${itemColor} ${pct}%, transparent)`;

  const showScore = vizMode === "lines" && score != null;

  const cellSet = new Set(shapeCells.map(([x, y]) => `${x},${y}`));
  const has = (x: number, y: number) => cellSet.has(`${x},${y}`);

  // Two highlight strategies (Tweak: highlightStyle)
  //  - halo: focused object gets a light ring of its own color
  //  - dim:  focused object is untouched; every other object dims back
  const filters = [];
  let itemOpacity = 1;
  // Strong halo on the focused object; applies in both modes.
  if (selected) filters.push(`drop-shadow(0 0 3px ${glow(95)}) drop-shadow(0 0 8px ${glow(55)})`);
  else if (highlighted)
    filters.push(`drop-shadow(0 0 4px ${glow(75)}) drop-shadow(0 0 10px ${glow(35)})`);
  // In dim mode, also push the non-focused objects back, but only gently,
  // just enough to make the highlighted shapes read forward without fading out.
  if (highlightStyle === "dim" && focusActive && !isFocused) {
    itemOpacity = 0.42;
  }

  const r = Math.max(4, Math.min(8, cell * 0.16));

  const gb = glyphBox(gx, gy, has, cell, gap);

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: totalW,
        height: totalH,
        userSelect: "none",
        touchAction: "none",
        filter: filters.length ? filters.join(" ") : "none",
        opacity: itemOpacity,
        transition: "filter 160ms ease, opacity 160ms ease",
        // The wrapper spans the shape's full bounding box, which for a non-rectangular
        // polyomino includes empty cells. Make the wrapper itself transparent to the
        // pointer so those empty cells don't swallow clicks/hovers meant for a smaller
        // shape sitting beneath them; interactivity lives on the filled path below.
        pointerEvents: "none",
      }}
    >
      {/* Single continuous shape: outline + fill traced from the polyomino perimeter.
          Pointer handlers sit on the path so only the filled cells are interactive. */}
      <svg
        width={totalW}
        height={totalH}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", display: "block" }}
      >
        <path
          d={shapeOutlinePath(shapeCells, cell, gap, r)}
          fill={surface}
          stroke={borderCol}
          strokeWidth={1}
          strokeLinejoin="round"
          onPointerDown={e => onPointerDown(e, p)}
          onPointerEnter={() => onHoverEnter && onHoverEnter(p)}
          onPointerLeave={() => onHoverLeave && onHoverLeave()}
          style={{ pointerEvents: "auto", cursor: "grab" }}
        >
          <title>{t.name}</title>
        </path>
      </svg>
      {/* Glyph overlay: centered in the most-central tile of the shape (gap-aware) */}
      <div
        style={{
          position: "absolute",
          left: gb.left,
          top: gb.top,
          width: gb.width,
          height: gb.height,
          padding: cell * 0.15,
          opacity: 0.92,
          pointerEvents: "none",
        }}
      >
        <Glyph kind={t.glyph} style={iconStyle} color={itemColor} w={1} h={1} />
      </div>
      {/* Score badge: only in graph/lines mode */}
      {showScore && (
        <div
          style={{
            position: "absolute",
            top: 2,
            right: 4,
            font: '500 10px/1 "JetBrains Mono", ui-monospace, monospace',
            color: isWarm ? "#3a2f22" : "rgba(255,255,255,0.78)",
            letterSpacing: "0.02em",
            pointerEvents: "none",
          }}
        >
          {score! >= 0 ? "+" : ""}
          {score}
        </div>
      )}
    </div>
  );
}
