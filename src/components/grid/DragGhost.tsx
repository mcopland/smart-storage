import { getDims, getShapeCells } from "../../model/geometry";
import type { CatalogById } from "../../model/types";
import { Glyph } from "../Glyph";
import { glyphBox, pickGlyphCell, shapeOutlinePath } from "./shapeOutline";
import type { Ghost } from "./useTrayGhost";

// Dashed shape preview shown while dragging a type from the tray over the
// grid. Renders nothing when the ghost's footprint leaves the grid.
export function DragGhost({
  ghost,
  cell,
  gap,
  gridW,
  gridH,
  iconStyle,
  typesById,
}: {
  ghost: Ghost;
  cell: number;
  gap: number;
  gridW: number;
  gridH: number;
  iconStyle: "solid" | "glyph";
  typesById: CatalogById;
}) {
  const ghostType = typesById[ghost.type];
  if (!ghostType) return null;
  const ghostCells = getShapeCells(ghost, typesById);

  const [gw, gh] = getDims(ghost, typesById);
  const inBounds = ghostCells.every(
    ([cx, cy]) =>
      ghost.x + cx >= 0 && ghost.y + cy >= 0 && ghost.x + cx < gridW && ghost.y + cy < gridH,
  );
  if (!inBounds) return null;
  const cellSet = new Set(ghostCells.map(([x, y]) => `${x},${y}`));
  const has = (x: number, y: number) => cellSet.has(`${x},${y}`);
  const [ggx, ggy] = pickGlyphCell(ghostCells);
  return (
    <div
      style={{
        position: "absolute",
        left: ghost.x * (cell + gap),
        top: ghost.y * (cell + gap),
        width: gw * cell + (gw - 1) * gap,
        height: gh * cell + (gh - 1) * gap,
        pointerEvents: "none",
      }}
    >
      <svg
        width={gw * cell + (gw - 1) * gap}
        height={gh * cell + (gh - 1) * gap}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          overflow: "visible",
          display: "block",
          opacity: 0.7,
        }}
      >
        <path
          d={shapeOutlinePath(ghostCells, cell, gap, 6)}
          fill={
            ghost.valid
              ? `color-mix(in oklab, ${ghostType.color} 12%, transparent)`
              : "rgba(255,80,80,0.05)"
          }
          stroke={ghost.valid ? ghostType.color : "oklch(0.7 0.18 25)"}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          strokeLinejoin="round"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          ...glyphBox(ggx, ggy, has, cell, gap),
          padding: cell * 0.15,
          opacity: 0.4,
          pointerEvents: "none",
        }}
      >
        <Glyph kind={ghostType.glyph} style={iconStyle} color={ghostType.color} w={1} h={1} />
      </div>
    </div>
  );
}
