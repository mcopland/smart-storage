// grid.jsx — interactive grid with cell-based shapes, drag/drop, rotate, multi-select, viz overlays

const { useState, useRef, useEffect, useCallback, useMemo } = React;

// Pick the most "central" cell in a shape: maximize neighbors in shape, tiebreak by distance to centroid.
function pickGlyphCell(shapeCells) {
  if (shapeCells.length === 0) return [0, 0];
  if (shapeCells.length === 1) return shapeCells[0];
  const set = new Set(shapeCells.map(([x, y]) => `${x},${y}`));
  const cx = shapeCells.reduce((s, c) => s + c[0], 0) / shapeCells.length;
  const cy = shapeCells.reduce((s, c) => s + c[1], 0) / shapeCells.length;
  let best = shapeCells[0];
  let bestNeighbors = -1;
  let bestDist = Infinity;
  for (const [x, y] of shapeCells) {
    let n = 0;
    if (set.has(`${x + 1},${y}`)) n++;
    if (set.has(`${x - 1},${y}`)) n++;
    if (set.has(`${x},${y + 1}`)) n++;
    if (set.has(`${x},${y - 1}`)) n++;
    const d = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
    if (n > bestNeighbors || (n === bestNeighbors && d < bestDist)) {
      best = [x, y];
      bestNeighbors = n;
      bestDist = d;
    }
  }
  return best;
}

// Centered box for a shape's glyph within its cell, accounting for the gap-fill
// that visually merges this cell with its in-shape neighbours. The tile background
// bleeds half a gap into each neighbouring side, so the glyph must be centered on
// the cell expanded by gap/2 on every side that has a neighbour — otherwise it
// reads as pushed toward the open corner. Returns coords relative to the
// placement origin. Line connectors anchor to this same box center so they line up.
function glyphBox(gx, gy, has, cell, gap) {
  const l = has(gx - 1, gy) ? gap / 2 : 0;
  const r = has(gx + 1, gy) ? gap / 2 : 0;
  const t = has(gx, gy - 1) ? gap / 2 : 0;
  const b = has(gx, gy + 1) ? gap / 2 : 0;
  return {
    left: gx * (cell + gap) - l,
    top: gy * (cell + gap) - t,
    width: cell + l + r,
    height: cell + t + b,
  };
}

// Build the filled region of a polyomino as a union of axis-aligned rectangles:
// each cell square, plus cell-aligned bridges into the gap toward in-shape
// neighbours (and the inner corner when a 2x2 block is solid). Bridges are exactly
// cell-width/height so the union has a clean rectilinear boundary with no diagonal
// nubs poking into concave corners.
function shapeRegionRects(cells, cell, gap) {
  const p = cell + gap;
  const set = new Set(cells.map(c => c[0] + "," + c[1]));
  const has = (x, y) => set.has(x + "," + y);
  const rects = [];
  for (const [x, y] of cells) {
    rects.push([x * p, y * p, x * p + cell, y * p + cell]);
    if (has(x + 1, y)) rects.push([x * p + cell, y * p, x * p + cell + gap, y * p + cell]);
    if (has(x, y + 1)) rects.push([x * p, y * p + cell, x * p + cell, y * p + cell + gap]);
    if (has(x + 1, y) && has(x, y + 1) && has(x + 1, y + 1))
      rects.push([x * p + cell, y * p + cell, x * p + cell + gap, y * p + cell + gap]);
  }
  return rects;
}

// Trace the outer boundary loops of a union of rectangles via a coordinate lattice
// + marching. Returns an array of loops, each an array of {x,y} vertices.
function unionContours(rects) {
  if (rects.length === 0) return [];
  const xs = [...new Set(rects.flatMap(r => [r[0], r[2]]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap(r => [r[1], r[3]]))].sort((a, b) => a - b);
  const nx = xs.length - 1,
    ny = ys.length - 1;
  const inside = (i, j) => {
    if (i < 0 || j < 0 || i >= nx || j >= ny) return false;
    const cx = (xs[i] + xs[i + 1]) / 2,
      cy = (ys[j] + ys[j + 1]) / 2;
    return rects.some(r => cx > r[0] && cx < r[2] && cy > r[1] && cy < r[3]);
  };
  const key = pt => pt[0] + "," + pt[1];
  const startMap = new Map();
  const pushEdge = (a, b) => {
    startMap.set(key(a), { a, b, used: false });
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!inside(i, j)) continue;
      const x0 = xs[i],
        x1 = xs[i + 1],
        y0 = ys[j],
        y1 = ys[j + 1];
      if (!inside(i, j - 1)) pushEdge([x1, y0], [x0, y0]); // top  (interior below)
      if (!inside(i, j + 1)) pushEdge([x0, y1], [x1, y1]); // bottom
      if (!inside(i - 1, j)) pushEdge([x0, y0], [x0, y1]); // left
      if (!inside(i + 1, j)) pushEdge([x1, y1], [x1, y0]); // right
    }
  }
  const loops = [];
  for (const seed of startMap.values()) {
    if (seed.used) continue;
    const loop = [];
    let cur = seed;
    while (cur && !cur.used) {
      cur.used = true;
      loop.push({ x: cur.a[0], y: cur.a[1] });
      cur = startMap.get(key(cur.b));
    }
    // collapse collinear vertices
    const simplified = [];
    for (let k = 0; k < loop.length; k++) {
      const a = loop[(k - 1 + loop.length) % loop.length];
      const b = loop[k];
      const c = loop[(k + 1) % loop.length];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(cross) > 1e-6) simplified.push(b);
    }
    if (simplified.length >= 3) loops.push(simplified);
  }
  return loops;
}

// Rounded SVG path for a polygon (rounds every corner, convex and concave).
function roundedLoopPath(pts, r) {
  const n = pts.length;
  if (n < 3) return "";
  let d = "";
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n],
      p1 = pts[i],
      p2 = pts[(i + 1) % n];
    const v1x = p0.x - p1.x,
      v1y = p0.y - p1.y;
    const v2x = p2.x - p1.x,
      v2y = p2.y - p1.y;
    const l1 = Math.hypot(v1x, v1y),
      l2 = Math.hypot(v2x, v2y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const ax = p1.x + (v1x / l1) * rr,
      ay = p1.y + (v1y / l1) * rr;
    const bx = p1.x + (v2x / l2) * rr,
      by = p1.y + (v2y / l2) * rr;
    d += (i === 0 ? `M ${ax} ${ay} ` : `L ${ax} ${ay} `) + `Q ${p1.x} ${p1.y} ${bx} ${by} `;
  }
  return d + "Z";
}

function shapeOutlinePath(cells, cell, gap, radius) {
  return unionContours(shapeRegionRects(cells, cell, gap))
    .map(loop => roundedLoopPath(loop, radius))
    .join(" ");
}

// ---------- placed item rendered on grid (cell-by-cell for complex shapes) ----------
function PlacedItem({
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
}) {
  const t = ITEM_BY_ID[p.type];
  const shapeCells = getShapeCells(p);
  const [bw, bh] = getDims(p);
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
  const glow = pct => `color-mix(in oklab, ${itemColor} ${pct}%, transparent)`;

  const showScore = vizMode === "lines" && score != null;

  const cellSet = new Set(shapeCells.map(([x, y]) => `${x},${y}`));
  const has = (x, y) => cellSet.has(`${x},${y}`);

  // Two highlight strategies (Tweak: highlightStyle)
  //  • halo — focused object gets a light ring of its own color
  //  • dim  — focused object is untouched; every other object dims back
  const filters = [];
  let itemOpacity = 1;
  // Strong halo on the focused object — applies in both modes.
  if (selected) filters.push(`drop-shadow(0 0 3px ${glow(95)}) drop-shadow(0 0 8px ${glow(55)})`);
  else if (highlighted) filters.push(`drop-shadow(0 0 4px ${glow(75)}) drop-shadow(0 0 10px ${glow(35)})`);
  // In dim mode, also push the non-focused objects back — but only gently,
  // just enough to make the highlighted shapes read forward without fading out.
  if (highlightStyle === "dim" && focusActive && !isFocused) {
    itemOpacity = 0.42;
  }

  const r = Math.max(4, Math.min(8, cell * 0.16));

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
        // shape sitting beneath them — interactivity lives on the filled path below.
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
      {/* Glyph overlay — centered in the most-central tile of the shape (gap-aware) */}
      {(() => {
        const gb = glyphBox(gx, gy, has, cell, gap);
        return (
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
        );
      })()}
      {/* Score badge — only in graph/lines mode */}
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
          {score >= 0 ? "+" : ""}
          {score}
        </div>
      )}
    </div>
  );
}

// ---------- visualization overlays ----------
function VizOverlay({ placements, cell, gap, gridW, gridH, mode, theme, selectedIds = [], highlightedTypeId = null }) {
  const totalW = gridW * cell + (gridW - 1) * gap;
  const totalH = gridH * cell + (gridH - 1) * gap;

  // When something is selected OR a type is hovered, the lines touching it read
  // forward; the rest recede.
  const selSet = new Set(selectedIds);
  const hasFocus = selSet.size > 0 || highlightedTypeId != null;
  const touchesFocus = pair =>
    selSet.has(pair.a.id) ||
    selSet.has(pair.b.id) ||
    (highlightedTypeId != null && (pair.a.type === highlightedTypeId || pair.b.type === highlightedTypeId));

  // Get the center of the glyph cell (gap-aware, matching the rendered glyph box)
  const glyphCenter = p => {
    const shapeCells = getShapeCells(p);
    const [gx, gy] = pickGlyphCell(shapeCells);
    const set = new Set(shapeCells.map(([x, y]) => `${x},${y}`));
    const has = (x, y) => set.has(`${x},${y}`);
    const gb = glyphBox(gx, gy, has, cell, gap);
    return {
      x: p.x * (cell + gap) + gb.left + gb.width / 2,
      y: p.y * (cell + gap) + gb.top + gb.height / 2,
    };
  };

  const adjPairs = useMemo(() => {
    const out = [];
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        if (adjacent(placements[i], placements[j])) {
          const ta = ITEM_BY_ID[placements[i].type];
          const tb = ITEM_BY_ID[placements[j].type];
          const da = tagSynergy(ta, tb);
          const db = tagSynergy(tb, ta);
          out.push({ a: placements[i], b: placements[j], delta: da + db });
        }
      }
    }
    return out;
  }, [placements]);

  return (
    <svg
      width={totalW}
      height={totalH}
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}
    >
      {(mode === "edges" || mode === "focus") &&
        adjPairs.map((pair, i) => {
          const sel = touchesFocus(pair);
          // In "focus" mode the edges stay hidden until an object is hovered/selected,
          // and then only the edges touching the focused object(s) are drawn.
          if (mode === "focus" && !sel) return null;
          const ca = glyphCenter(pair.a),
            cb = glyphCenter(pair.b);
          const colorA = ITEM_BY_ID[pair.a.type].color;
          const colorB = ITEM_BY_ID[pair.b.type].color;
          const positive = pair.delta >= 0;
          const gradId = `edge-grad-${i}`;
          // Blend both endpoints' colors along the line (penalty still shown via dashes).
          const stroke = `url(#${gradId})`;
          const dim = hasFocus && !sel;
          const haloW = sel ? 9 : 6;
          const haloOp = dim ? 0.05 : sel ? 0.34 : 0.18;
          const lineW = sel ? 2.5 : 1.5;
          const lineOp = dim ? 0.18 : sel ? 1 : 0.7;
          return (
            <g key={i} style={{ transition: "opacity 160ms ease" }}>
              <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1={ca.x} y1={ca.y} x2={cb.x} y2={cb.y}>
                <stop offset="0%" stopColor={colorA} />
                <stop offset="100%" stopColor={colorB} />
              </linearGradient>
              <line
                x1={ca.x}
                y1={ca.y}
                x2={cb.x}
                y2={cb.y}
                stroke={stroke}
                strokeWidth={haloW}
                opacity={haloOp}
                strokeLinecap="round"
              />
              <line
                x1={ca.x}
                y1={ca.y}
                x2={cb.x}
                y2={cb.y}
                stroke={stroke}
                strokeWidth={lineW}
                opacity={lineOp}
                strokeLinecap="round"
                strokeDasharray={positive ? "0" : "4 4"}
              />
            </g>
          );
        })}
      {mode === "lines" &&
        adjPairs.map((pair, i) => {
          const ca = glyphCenter(pair.a),
            cb = glyphCenter(pair.b);
          const mx = (ca.x + cb.x) / 2;
          const my = (ca.y + cb.y) / 2;
          const positive = pair.delta >= 0;
          const sel = touchesFocus(pair);
          const dim = hasFocus && !sel;
          const stroke = theme === "warm" ? "rgba(60,50,40,0.45)" : "rgba(255,255,255,0.35)";
          const labelBg = theme === "warm" ? "#fbf8f0" : "#0e1116";
          const labelFg = positive ? (theme === "warm" ? "#3a2f22" : "rgba(255,255,255,0.92)") : "oklch(0.7 0.18 25)";
          return (
            <g key={i} opacity={dim ? 0.22 : 1} style={{ transition: "opacity 160ms ease" }}>
              <line
                x1={ca.x}
                y1={ca.y}
                x2={cb.x}
                y2={cb.y}
                stroke={stroke}
                strokeWidth={sel ? 2 : 1}
                strokeDasharray={positive ? "0" : "3 3"}
              />
              {pair.delta !== 0 && (
                <g transform={`translate(${mx},${my})`}>
                  <rect
                    x={-12}
                    y={-7}
                    width={24}
                    height={14}
                    rx={3}
                    fill={labelBg}
                    stroke={stroke}
                    strokeWidth={sel ? 1 : 0.5}
                  />
                  <text
                    x={0}
                    y={3.5}
                    textAnchor="middle"
                    fontFamily="'JetBrains Mono', monospace"
                    fontSize="9"
                    fontWeight={sel ? 600 : 500}
                    fill={labelFg}
                  >
                    {positive ? "+" : ""}
                    {pair.delta}
                  </text>
                </g>
              )}
            </g>
          );
        })}
    </svg>
  );
}

// ---------- the grid surface ----------
function GridSurface({
  placements,
  setPlacements,
  inventory,
  setInventory,
  selectedIds,
  setSelectedIds,
  gridW,
  gridH,
  cell,
  gap,
  vizMode,
  theme,
  iconStyle,
  scoreData,
  draggingFromTray,
  setDraggingFromTray,
  disabledCells,
  toggleDisabledCell,
  highlightedTypeId,
  onHoverTypeId,
  hoveredId,
  onHoverPlacement,
  highlightStyle,
}) {
  const surfaceRef = useRef(null);
  const dragState = useRef(null);
  const [marquee, setMarquee] = useState(null);
  const [ghost, setGhost] = useState(null);

  // Re-evaluate the ghost when the tray-drag rotation changes (rotate via "R" while dragging)
  useEffect(() => {
    if (!draggingFromTray) return;
    setGhost(g => {
      if (!g) return g;
      const candidate = { id: "__ghost", type: draggingFromTray.type, x: g.x, y: g.y, rot: draggingFromTray.rot ?? 0 };
      const valid = fits(candidate, placements, gridW, gridH, "__ghost", disabledCells);
      return { ...candidate, valid };
    });
  }, [draggingFromTray, placements, gridW, gridH, disabledCells]);

  const isWarm = theme === "warm";
  // A "focus" is active when something is selected or an inventory type is hovered.
  const focusActive = selectedIds.length > 0 || highlightedTypeId != null || hoveredId != null;
  const totalW = gridW * cell + (gridW - 1) * gap;
  const totalH = gridH * cell + (gridH - 1) * gap;

  const cellAt = useCallback(
    (clientX, clientY) => {
      const r = surfaceRef.current.getBoundingClientRect();
      const px = clientX - r.left;
      const py = clientY - r.top;
      return { x: Math.floor(px / (cell + gap)), y: Math.floor(py / (cell + gap)), px, py };
    },
    [cell, gap],
  );

  // Start dragging an existing placement — stores whether it was already selected for toggle-deselect.
  const onItemPointerDown = (e, p) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    const wasAlreadySelected = selectedIds.includes(p.id);
    let idsToMove;
    if (wasAlreadySelected) {
      idsToMove = selectedIds;
    } else {
      idsToMove = [p.id];
      setSelectedIds([p.id]);
    }
    const r = surfaceRef.current.getBoundingClientRect();
    const startPx = e.clientX - r.left;
    const startPy = e.clientY - r.top;
    const moving = placements.filter(q => idsToMove.includes(q.id));
    dragState.current = {
      kind: "move",
      ids: idsToMove,
      origPositions: Object.fromEntries(moving.map(q => [q.id, { x: q.x, y: q.y }])),
      anchor: { x: p.x, y: p.y },
      startPx,
      startPy,
      pointerId: e.pointerId,
      moved: false,
      wasAlreadySelected,
      clickedId: p.id,
    };
  };

  const onSurfacePointerDown = e => {
    // Check if panning is active via data attribute set by PannableContainer
    if (e.currentTarget.closest('[data-panning="true"]')) return;

    if (e.target !== e.currentTarget && e.target.tagName !== "svg" && !e.target.classList?.contains("grid-bg")) return;
    if (draggingFromTray) return;
    if (e.altKey && e.target.classList?.contains("grid-bg") && e.target.dataset.cellX != null) {
      const cx = parseInt(e.target.dataset.cellX, 10);
      const cy = parseInt(e.target.dataset.cellY, 10);
      toggleDisabledCell?.(cx, cy);
      return;
    }
    surfaceRef.current.setPointerCapture(e.pointerId);
    const { px, py } = cellAt(e.clientX, e.clientY);
    dragState.current = {
      kind: "marquee",
      startPx: px,
      startPy: py,
      pointerId: e.pointerId,
      additive: e.shiftKey,
      origSelection: e.shiftKey ? [...selectedIds] : [],
    };
    setMarquee({ x0: px, y0: py, x1: px, y1: py });
    if (!e.shiftKey) setSelectedIds([]);
  };

  const onSurfacePointerMove = e => {
    if (draggingFromTray) {
      const { x, y } = cellAt(e.clientX, e.clientY);
      const candidate = { id: "__ghost", type: draggingFromTray.type, x, y, rot: draggingFromTray.rot ?? 0 };
      const valid = fits(candidate, placements, gridW, gridH, "__ghost", disabledCells);
      setGhost({ ...candidate, valid });
      return;
    }
    if (!dragState.current) return;
    if (dragState.current.kind === "marquee") {
      const { px, py } = cellAt(e.clientX, e.clientY);
      const m = { x0: dragState.current.startPx, y0: dragState.current.startPy, x1: px, y1: py };
      setMarquee(m);
      const xa = Math.min(m.x0, m.x1),
        xb = Math.max(m.x0, m.x1);
      const ya = Math.min(m.y0, m.y1),
        yb = Math.max(m.y0, m.y1);
      const hits = placements
        .filter(p => {
          const [w, h] = getDims(p);
          const left = p.x * (cell + gap),
            top = p.y * (cell + gap);
          const right = left + w * cell + (w - 1) * gap,
            bottom = top + h * cell + (h - 1) * gap;
          return !(right < xa || left > xb || bottom < ya || top > yb);
        })
        .map(p => p.id);
      const next = dragState.current.additive
        ? Array.from(new Set([...dragState.current.origSelection, ...hits]))
        : hits;
      setSelectedIds(next);
      return;
    }
    if (dragState.current.kind === "move") {
      const { startPx, startPy, ids, origPositions } = dragState.current;
      const { px, py } = cellAt(e.clientX, e.clientY);
      const dx = Math.round((px - startPx) / (cell + gap));
      const dy = Math.round((py - startPy) / (cell + gap));
      if (dx === 0 && dy === 0 && !dragState.current.moved) return;
      dragState.current.moved = true;
      const proposed = placements.map(p => {
        if (!ids.includes(p.id)) return p;
        const orig = origPositions[p.id];
        return { ...p, x: orig.x + dx, y: orig.y + dy };
      });
      const movingIds = new Set(ids);
      const stationary = proposed.filter(p => !movingIds.has(p.id));
      let ok = true;
      for (const p of proposed.filter(q => movingIds.has(q.id))) {
        if (
          !fits(
            p,
            [...stationary, ...proposed.filter(q => movingIds.has(q.id) && q.id !== p.id)],
            gridW,
            gridH,
            p.id,
            disabledCells,
          )
        ) {
          ok = false;
          break;
        }
      }
      if (ok) setPlacements(proposed);
    }
  };

  const onSurfacePointerUp = e => {
    if (draggingFromTray && ghost) {
      if (ghost.valid) {
        const newPlacement = {
          id: "p" + Date.now() + Math.floor(Math.random() * 999),
          type: ghost.type,
          x: ghost.x,
          y: ghost.y,
          rot: ghost.rot,
        };
        setPlacements([...placements, newPlacement]);
        setInventory({ ...inventory, [ghost.type]: Math.max(0, (inventory[ghost.type] || 0) - 1) });
      }
      setDraggingFromTray(null);
      setGhost(null);
      return;
    }
    // Toggle-deselect: click on already-selected item without dragging
    if (dragState.current?.kind === "move" && !dragState.current.moved && dragState.current.wasAlreadySelected) {
      if (dragState.current.ids.length === 1) {
        setSelectedIds([]);
      } else {
        // Multi-selection: narrow to just the clicked item
        setSelectedIds([dragState.current.clickedId]);
      }
    }
    // Deselect after an actual drag — the object is highlighted while moving but
    // shouldn't stay selected once dropped.
    if (dragState.current?.kind === "move" && dragState.current.moved) {
      setSelectedIds([]);
    }
    if (dragState.current?.kind === "marquee") {
      setMarquee(null);
    }
    dragState.current = null;
  };

  // Grid background cells
  const dots = [];
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const key = `${x},${y}`;
      const isDisabled = disabledCells?.has(key);
      dots.push(
        <div
          key={key}
          className="grid-bg"
          data-cell-x={x}
          data-cell-y={y}
          style={{
            position: "absolute",
            left: x * (cell + gap),
            top: y * (cell + gap),
            width: cell,
            height: cell,
            border: `1px solid ${
              isDisabled
                ? isWarm
                  ? "rgba(60,50,40,0.18)"
                  : "rgba(255,255,255,0.12)"
                : isWarm
                  ? "rgba(60,50,40,0.07)"
                  : "rgba(255,255,255,0.05)"
            }`,
            borderRadius: 5,
            background: isDisabled
              ? isWarm
                ? "repeating-linear-gradient(135deg, rgba(60,50,40,0.08) 0 2px, transparent 2px 6px)"
                : "repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 6px)"
              : isWarm
                ? "rgba(255,253,247,0.4)"
                : "rgba(255,255,255,0.012)",
          }}
        />,
      );
    }
  }

  return (
    <div
      ref={surfaceRef}
      data-grid-surface=""
      onPointerDown={onSurfacePointerDown}
      onPointerMove={onSurfacePointerMove}
      onPointerUp={onSurfacePointerUp}
      onPointerLeave={() => {
        if (draggingFromTray) setGhost(null);
      }}
      style={{
        position: "relative",
        width: totalW,
        height: totalH,
        margin: "0 auto",
        touchAction: "none",
      }}
    >
      <div className="grid-bg" style={{ position: "absolute", inset: 0 }}>
        {dots}
      </div>

      {/* Placements */}
      {placements.map(p => (
        <PlacedItem
          key={p.id}
          p={p}
          cell={cell}
          gap={gap}
          selected={selectedIds.includes(p.id)}
          score={scoreData?.perItem[p.id]?.total}
          vizMode={vizMode}
          onPointerDown={onItemPointerDown}
          onHoverEnter={pl => onHoverPlacement && onHoverPlacement(pl.id)}
          onHoverLeave={() => onHoverPlacement && onHoverPlacement(null)}
          theme={theme}
          iconStyle={iconStyle}
          highlighted={highlightedTypeId === p.type || hoveredId === p.id}
          highlightStyle={highlightStyle}
          focusActive={focusActive}
        />
      ))}

      {/* Viz overlay over items */}
      {(vizMode === "edges" || vizMode === "focus" || vizMode === "lines") && (
        <VizOverlay
          placements={placements}
          cell={cell}
          gap={gap}
          gridW={gridW}
          gridH={gridH}
          mode={vizMode}
          theme={theme}
          selectedIds={hoveredId != null ? [...selectedIds, hoveredId] : selectedIds}
          highlightedTypeId={highlightedTypeId}
        />
      )}

      {/* Ghost from tray */}
      {ghost &&
        (() => {
          const t = ITEM_BY_ID[ghost.type];
          const ghostCells = getShapeCells(ghost);
          const [gw, gh] = getDims(ghost);
          const inBounds = ghostCells.every(
            ([cx, cy]) => ghost.x + cx >= 0 && ghost.y + cy >= 0 && ghost.x + cx < gridW && ghost.y + cy < gridH,
          );
          if (!inBounds) return null;
          const cellSet = new Set(ghostCells.map(([x, y]) => `${x},${y}`));
          const has = (x, y) => cellSet.has(`${x},${y}`);
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
                style={{ position: "absolute", left: 0, top: 0, overflow: "visible", display: "block", opacity: 0.7 }}
              >
                <path
                  d={shapeOutlinePath(ghostCells, cell, gap, 6)}
                  fill={ghost.valid ? `color-mix(in oklab, ${t.color} 12%, transparent)` : "rgba(255,80,80,0.05)"}
                  stroke={ghost.valid ? t.color : "oklch(0.7 0.18 25)"}
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
                <Glyph kind={t.glyph} style={iconStyle} color={t.color} w={1} h={1} />
              </div>
            </div>
          );
        })()}

      {/* Marquee */}
      {marquee && (
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
      )}
    </div>
  );
}

window.GridSurface = GridSurface;
window.PlacedItem = PlacedItem;
