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
  const surface = isWarm ? "rgba(255,250,240,0.85)" : "rgba(20,26,34,0.82)";
  const borderCol = selected ? itemColor : isWarm ? "rgba(60,50,40,0.22)" : "rgba(255,255,255,0.12)";

  const showScore = vizMode === "lines" && score != null;

  const cellSet = new Set(shapeCells.map(([x, y]) => `${x},${y}`));
  const has = (x, y) => cellSet.has(`${x},${y}`);

  // Use filter: drop-shadow for non-rectangular glow
  const filters = [];
  if (selected) filters.push(`drop-shadow(0 0 4px ${itemColor}) drop-shadow(0 2px 8px ${itemColor}55)`);
  if (highlighted && !selected)
    filters.push(`drop-shadow(0 0 6px ${itemColor}77) drop-shadow(0 0 12px ${itemColor}33)`);

  const r = Math.max(4, Math.min(8, cell * 0.16));

  return (
    <div
      onPointerDown={e => onPointerDown(e, p)}
      onPointerEnter={() => onHoverEnter && onHoverEnter(p.type)}
      onPointerLeave={() => onHoverLeave && onHoverLeave()}
      title={t.name}
      style={{
        position: "absolute",
        left,
        top,
        width: totalW,
        height: totalH,
        cursor: "grab",
        userSelect: "none",
        touchAction: "none",
        filter: filters.length ? filters.join(" ") : "none",
        transition: "filter 160ms ease",
      }}
    >
      {/* Cell backgrounds */}
      {shapeCells.map(([cx, cy]) => {
        const cLeft = cx * (cell + gap);
        const cTop = cy * (cell + gap);
        const cW = cell + (has(cx + 1, cy) ? gap : 0);
        const cH = cell + (has(cx, cy + 1) ? gap : 0);
        const tl = !has(cx - 1, cy) && !has(cx, cy - 1) ? r : 0;
        const tr = !has(cx + 1, cy) && !has(cx, cy - 1) ? r : 0;
        const br = !has(cx + 1, cy) && !has(cx, cy + 1) ? r : 0;
        const bl = !has(cx - 1, cy) && !has(cx, cy + 1) ? r : 0;
        return (
          <div
            key={`${cx},${cy}`}
            style={{
              position: "absolute",
              left: cLeft,
              top: cTop,
              width: cW,
              height: cH,
              background: surface,
              backdropFilter: "blur(6px)",
              borderRadius: `${tl}px ${tr}px ${br}px ${bl}px`,
              border: `1px solid ${borderCol}`,
              borderRight: has(cx + 1, cy) ? "none" : `1px solid ${borderCol}`,
              borderBottom: has(cx, cy + 1) ? "none" : `1px solid ${borderCol}`,
            }}
          ></div>
        );
      })}
      {/* Glyph overlay — positioned in most-central tile of the shape */}
      <div
        style={{
          position: "absolute",
          left: gx * (cell + gap),
          top: gy * (cell + gap),
          width: cell,
          height: cell,
          padding: cell * 0.15,
          opacity: 0.92,
          pointerEvents: "none",
        }}
      >
        <Glyph kind={t.glyph} style={iconStyle} color={itemColor} w={1} h={1} />
      </div>
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
function VizOverlay({ placements, cell, gap, gridW, gridH, mode, theme }) {
  const totalW = gridW * cell + (gridW - 1) * gap;
  const totalH = gridH * cell + (gridH - 1) * gap;

  // Get the center of the glyph cell (not the entire placement)
  const glyphCenter = p => {
    const shapeCells = getShapeCells(p);
    const [gx, gy] = pickGlyphCell(shapeCells);
    return {
      x: (p.x + gx) * (cell + gap) + cell / 2,
      y: (p.y + gy) * (cell + gap) + cell / 2,
    };
  };

  const adjPairs = useMemo(() => {
    const out = [];
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        if (adjacent(placements[i], placements[j])) {
          const ta = ITEM_BY_ID[placements[i].type];
          const tb = ITEM_BY_ID[placements[j].type];
          const da = ta.synergy[placements[j].type] ?? 0;
          const db = tb.synergy[placements[i].type] ?? 0;
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
      {mode === "edges" &&
        adjPairs.map((pair, i) => {
          const ca = glyphCenter(pair.a),
            cb = glyphCenter(pair.b);
          const colorA = ITEM_BY_ID[pair.a.type].color;
          const positive = pair.delta >= 0;
          const stroke = positive ? colorA : "oklch(0.7 0.18 25)";
          return (
            <g key={i}>
              <line
                x1={ca.x}
                y1={ca.y}
                x2={cb.x}
                y2={cb.y}
                stroke={stroke}
                strokeWidth={6}
                opacity={0.18}
                strokeLinecap="round"
              />
              <line
                x1={ca.x}
                y1={ca.y}
                x2={cb.x}
                y2={cb.y}
                stroke={stroke}
                strokeWidth={1.5}
                opacity={0.7}
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
          const stroke = theme === "warm" ? "rgba(60,50,40,0.45)" : "rgba(255,255,255,0.35)";
          const labelBg = theme === "warm" ? "#fbf8f0" : "#0e1116";
          const labelFg = positive ? (theme === "warm" ? "#3a2f22" : "rgba(255,255,255,0.92)") : "oklch(0.7 0.18 25)";
          return (
            <g key={i}>
              <line
                x1={ca.x}
                y1={ca.y}
                x2={cb.x}
                y2={cb.y}
                stroke={stroke}
                strokeWidth={1}
                strokeDasharray={positive ? "0" : "3 3"}
              />
              {pair.delta !== 0 && (
                <g transform={`translate(${mx},${my})`}>
                  <rect x={-12} y={-7} width={24} height={14} rx={3} fill={labelBg} stroke={stroke} strokeWidth={0.5} />
                  <text
                    x={0}
                    y={3.5}
                    textAnchor="middle"
                    fontFamily="'JetBrains Mono', monospace"
                    fontSize="9"
                    fontWeight="500"
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
          onHoverEnter={typeId => onHoverTypeId && onHoverTypeId(typeId)}
          onHoverLeave={() => onHoverTypeId && onHoverTypeId(null)}
          theme={theme}
          iconStyle={iconStyle}
          highlighted={highlightedTypeId === p.type}
        />
      ))}

      {/* Viz overlay over items */}
      {(vizMode === "edges" || vizMode === "lines") && (
        <VizOverlay
          placements={placements}
          cell={cell}
          gap={gap}
          gridW={gridW}
          gridH={gridH}
          mode={vizMode}
          theme={theme}
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
              {ghostCells.map(([cx, cy]) => {
                const cW = cell + (has(cx + 1, cy) ? gap : 0);
                const cH = cell + (has(cx, cy + 1) ? gap : 0);
                const gr = 6;
                const tl = !has(cx - 1, cy) && !has(cx, cy - 1) ? gr : 0;
                const tr = !has(cx + 1, cy) && !has(cx, cy - 1) ? gr : 0;
                const br = !has(cx + 1, cy) && !has(cx, cy + 1) ? gr : 0;
                const bl = !has(cx - 1, cy) && !has(cx, cy + 1) ? gr : 0;
                return (
                  <div
                    key={`${cx},${cy}`}
                    style={{
                      position: "absolute",
                      left: cx * (cell + gap),
                      top: cy * (cell + gap),
                      width: cW,
                      height: cH,
                      border: `1.5px dashed ${ghost.valid ? t.color : "oklch(0.7 0.18 25)"}`,
                      borderRadius: `${tl}px ${tr}px ${br}px ${bl}px`,
                      borderRight: has(cx + 1, cy) ? "none" : undefined,
                      borderBottom: has(cx, cy + 1) ? "none" : undefined,
                      background: ghost.valid ? `${t.color}15` : "rgba(255,80,80,0.05)",
                      opacity: 0.7,
                    }}
                  ></div>
                );
              })}
              <div
                style={{
                  position: "absolute",
                  left: ggx * (cell + gap),
                  top: ggy * (cell + gap),
                  width: cell,
                  height: cell,
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
