// panels.jsx — left tray + right side panel + topbar widgets + glyph picker

const GLYPH_KINDS = ["hex", "diamond", "tri", "rect", "circle", "pent", "star", "cross"];

// ---- Reusable Section (MUST be defined outside components to prevent remount) ----
function PanelSection({ label, children, theme }) {
  const isWarm = theme === "warm";
  const fgFaint = isWarm ? "rgba(60,50,40,0.35)" : "rgba(255,255,255,0.32)";
  const border = isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.07)";
  return (
    <div style={{ padding: "14px 18px", borderBottom: `1px solid ${border}` }}>
      <div
        style={{
          font: '500 10px/1 "JetBrains Mono", monospace',
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: fgFaint,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

// ---- Tray metrics — single source of truth for inventory sizing ----
// Panel width is DERIVED from the tile content (size, gap, column count, padding,
// and the reserved scrollbar gutter) so it always hugs the columns exactly,
// regardless of how the tiles are styled. No magic width constants.
function trayMetrics(isRail) {
  const tileSize = isRail ? 68 : 76;
  const gap = isRail ? 6 : 8;
  const cols = isRail ? 1 : 2;
  const padL = isRail ? 10 : 16;
  const padR = isRail ? 2 : 8;
  const gutter = 8; // scrollbar-gutter: stable keeps width constant whether or not it scrolls
  const width = padL + cols * tileSize + (cols - 1) * gap + padR + gutter;
  return { tileSize, gap, cols, padL, padR, gutter, width, padCss: `14px ${padR}px 14px ${padL}px` };
}
window.trayMetrics = trayMetrics;

// ---- Tray (drawer / rail) ----
function Tray({
  inventory,
  itemTypes,
  selectedTypeId,
  onSelectType,
  onStartDrag,
  onAddNew,
  onPlaceAll,
  theme,
  iconStyle,
  layout,
  highlightedTypeId,
  onHoverTypeId,
}) {
  const isWarm = theme === "warm";
  const isRail = layout === "rail";
  const cellBorder = isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.08)";
  const cellBg = isWarm ? "rgba(255,253,247,0.5)" : "rgba(255,255,255,0.02)";
  const m = trayMetrics(isRail);
  const { tileSize, gap, cols } = m;
  const accent = "oklch(0.78 0.12 195)";

  const dragRef = React.useRef(null);
  const startInteract = (e, type, disabled) => {
    if (disabled) return;
    e.preventDefault();
    dragRef.current = { id: type.id, startX: e.clientX, startY: e.clientY, started: false, type };
    const onMove = mv => {
      const d = dragRef.current;
      if (!d || d.started) return;
      const dx = mv.clientX - d.startX,
        dy = mv.clientY - d.startY;
      if (dx * dx + dy * dy > 16) {
        d.started = true;
        cleanup();
        onStartDrag(mv, d.type);
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      cleanup();
      if (d && !d.started) onSelectType(d.id);
      dragRef.current = null;
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          scrollbarGutter: "stable",
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, ${tileSize}px)`,
          gap: gap,
          justifyContent: "start",
          alignContent: "flex-start",
          padding: m.padCss,
        }}
      >
        {!isRail && (
          <div
            style={{
              gridColumn: "1 / -1",
              font: '500 10px/1 "JetBrains Mono", monospace',
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: isWarm ? "rgba(60,50,40,0.5)" : "rgba(255,255,255,0.4)",
              marginBottom: 6,
            }}
          >
            Inventory
          </div>
        )}
        {itemTypes.map(tt => {
          const count = inventory[tt.id] ?? 0;
          const disabled = count <= 0;
          const [w, h] = getTypeSize(tt);
          const isSel = selectedTypeId === tt.id;
          const numCells = tt.cells ? tt.cells.length : w * h;
          return (
            <div
              key={tt.id}
              data-tray-item={tt.id}
              onPointerDown={e => startInteract(e, tt, disabled)}
              onPointerEnter={() => {
                if (!disabled && onHoverTypeId) onHoverTypeId(tt.id);
              }}
              onPointerLeave={() => {
                if (onHoverTypeId) onHoverTypeId(null);
              }}
              title={`${tt.name} — ${numCells} cells${tt.tags && tt.tags.length ? ` · ${tt.tags.join(", ")}` : ""}${disabled ? " (none in stock)" : ""}`}
              style={{
                position: "relative",
                width: tileSize,
                height: tileSize,
                border: `1px solid ${isSel ? accent : cellBorder}`,
                boxShadow: isSel
                  ? `0 0 0 1px ${accent}`
                  : highlightedTypeId === tt.id
                    ? `0 0 10px 3px color-mix(in oklab, ${tt.color} 27%, transparent)`
                    : "none",
                borderRadius: 8,
                background: isSel ? (isWarm ? "rgba(94,234,212,0.08)" : "rgba(94,234,212,0.06)") : cellBg,
                padding: "8px 10px 18px",
                cursor: disabled ? "not-allowed" : "grab",
                opacity: disabled ? 0.32 : 1,
                touchAction: "none",
                transition: "border-color 120ms, box-shadow 120ms, background 120ms",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onPointerOver={e => {
                if (!disabled && !isSel) e.currentTarget.style.borderColor = tt.color;
              }}
              onPointerOut={e => {
                if (!isSel) e.currentTarget.style.borderColor = cellBorder;
              }}
            >
              <div style={{ width: 32, height: 32 }}>
                <Glyph kind={tt.glyph} style={iconStyle} color={tt.color} w={1} h={1} />
              </div>
              <div
                style={{
                  position: "absolute",
                  top: 4,
                  right: 6,
                  font: '500 9px/1 "JetBrains Mono", monospace',
                  color: isWarm ? "rgba(60,50,40,0.65)" : "rgba(255,255,255,0.6)",
                }}
              >
                ×{count}
              </div>
              <div
                style={{
                  position: "absolute",
                  bottom: 4,
                  left: 6,
                  right: 6,
                  font: "500 9px/1 Inter, sans-serif",
                  color: isWarm ? "rgba(60,50,40,0.75)" : "rgba(255,255,255,0.7)",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={tt.name}
              >
                {tt.name}
              </div>
            </div>
          );
        })}

        {canCreateNewObject(itemTypes) ? (
          <button
            onClick={onAddNew}
            title="Define new object type"
            style={{
              width: tileSize,
              height: tileSize,
              border: `1px dashed ${isWarm ? "rgba(60,50,40,0.25)" : "rgba(255,255,255,0.18)"}`,
              borderRadius: 8,
              background: "transparent",
              color: isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.45)",
              font: "300 28px/1 Inter, sans-serif",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "border-color 120ms, color 120ms",
            }}
            onPointerEnter={e => {
              e.currentTarget.style.borderColor = "oklch(0.78 0.12 195)";
              e.currentTarget.style.color = "oklch(0.78 0.12 195)";
            }}
            onPointerLeave={e => {
              e.currentTarget.style.borderColor = isWarm ? "rgba(60,50,40,0.25)" : "rgba(255,255,255,0.18)";
              e.currentTarget.style.color = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.45)";
            }}
          >
            +
          </button>
        ) : (
          <div
            title={`Maximum ${MAX_OBJECT_TYPES} object types reached`}
            style={{
              width: tileSize,
              height: tileSize,
              border: `1px dashed ${isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 8,
              background: "transparent",
              color: isWarm ? "rgba(60,50,40,0.25)" : "rgba(255,255,255,0.2)",
              font: "300 28px/1 Inter, sans-serif",
              cursor: "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.5,
            }}
          >
            +
          </div>
        )}
      </div>

      {onPlaceAll &&
        (() => {
          const remaining = itemTypes.reduce((s, tt) => s + Math.max(0, inventory[tt.id] ?? 0), 0);
          const disabled = remaining <= 0;
          const fBorder = isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.07)";
          return (
            <div
              style={{
                flexShrink: 0,
                padding: isRail ? "10px 8px" : "12px 16px",
                borderTop: `1px solid ${fBorder}`,
              }}
            >
              <button
                onClick={onPlaceAll}
                disabled={disabled}
                title={disabled ? "Inventory is empty" : "Place all inventory items onto the workspace"}
                style={{
                  width: "100%",
                  padding: isRail ? "8px 4px" : "9px 12px",
                  background: disabled ? "transparent" : isWarm ? "rgba(94,234,212,0.1)" : "rgba(94,234,212,0.08)",
                  border: `1px solid ${disabled ? fBorder : accent}`,
                  borderRadius: 6,
                  cursor: disabled ? "not-allowed" : "pointer",
                  color: disabled ? (isWarm ? "rgba(60,50,40,0.3)" : "rgba(255,255,255,0.25)") : accent,
                  font: isRail ? '500 9px/1.2 "JetBrains Mono", monospace' : "500 12px/1 Inter, sans-serif",
                  letterSpacing: isRail ? "0.04em" : "0.01em",
                  transition: "background 120ms, border-color 120ms",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                onPointerEnter={e => {
                  if (!disabled)
                    e.currentTarget.style.background = isWarm ? "rgba(94,234,212,0.18)" : "rgba(94,234,212,0.14)";
                }}
                onPointerLeave={e => {
                  if (!disabled)
                    e.currentTarget.style.background = isWarm ? "rgba(94,234,212,0.1)" : "rgba(94,234,212,0.08)";
                }}
              >
                {isRail ? "Place" : `Place all${remaining > 0 ? ` (${remaining})` : ""}`}
              </button>
            </div>
          );
        })()}
    </div>
  );
}

// ---- Glyph picker ----
function GlyphPicker({ value, color, onChange, theme }) {
  const isWarm = theme === "warm";
  const surface = isWarm ? "#fbf8f0" : "#1a2230";
  const border = isWarm ? "rgba(60,50,40,0.18)" : "rgba(255,255,255,0.12)";
  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        left: 0,
        zIndex: 1100,
        padding: 10,
        background: surface,
        border: `1px solid ${border}`,
        borderRadius: 8,
        boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
        display: "grid",
        gridTemplateColumns: "repeat(3, 38px)",
        gap: 6,
      }}
      onClick={e => e.stopPropagation()}
    >
      {GLYPH_KINDS.map(g => {
        const sel = g === value;
        return (
          <button
            key={g}
            onClick={() => onChange(g)}
            title={g}
            style={{
              width: 38,
              height: 38,
              padding: 6,
              background: sel ? (isWarm ? "rgba(94,234,212,0.12)" : "rgba(94,234,212,0.1)") : "transparent",
              border: `1px solid ${sel ? color : border}`,
              borderRadius: 5,
              cursor: "pointer",
            }}
            onPointerEnter={e => {
              if (!sel) e.currentTarget.style.borderColor = color;
            }}
            onPointerLeave={e => {
              if (!sel) e.currentTarget.style.borderColor = border;
            }}
          >
            <Glyph kind={g} style="solid" color={color} w={1} h={1} />
          </button>
        );
      })}
    </div>
  );
}

function GlyphIconButton({ glyph, color, theme, onPick }) {
  const isWarm = theme === "warm";
  const border = isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)";
  const inputBg = isWarm ? "rgba(255,253,247,0.6)" : "rgba(255,255,255,0.03)";
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Choose glyph"
        style={{
          width: 44,
          height: 44,
          padding: 7,
          border: `1px solid ${open ? color : border}`,
          borderRadius: 6,
          background: inputBg,
          cursor: "pointer",
          transition: "border-color 120ms",
        }}
      >
        <Glyph kind={glyph} style="solid" color={color} w={1} h={1} />
      </button>
      {open && (
        <GlyphPicker
          value={glyph}
          color={color}
          theme={theme}
          onChange={g => {
            onPick(g);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ---- TextField with local draft state to fix the 1-char input bug ----
// The root cause: parent re-renders on every keystroke (due to setItemTypes) which
// remounted the old Section (defined inside ScorePanel). Now Section is external,
// but we also use local draft state for extra safety.
function TextField({ value, onChange, style, multiline }) {
  const [draft, setDraft] = React.useState(value);
  const focusRef = React.useRef(false);
  React.useEffect(() => {
    if (!focusRef.current) setDraft(value);
  }, [value]);
  const props = {
    value: draft,
    onFocus: () => {
      focusRef.current = true;
    },
    onChange: e => {
      setDraft(e.target.value);
      onChange(e.target.value);
    },
    onBlur: () => {
      focusRef.current = false;
      setDraft(value);
    },
    style,
  };
  if (multiline) return <textarea {...props} rows={2} />;
  return <input {...props} />;
}

// ---- Tag chips — the strings an object carries (e.g. "Sword", "Electric") ----
function TagChips({ tags, onChange, theme, color, suggestions }) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgFaint = isWarm ? "rgba(60,50,40,0.4)" : "rgba(255,255,255,0.35)";
  const border = isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.07)";
  const inputBg = isWarm ? "rgba(255,253,247,0.6)" : "rgba(255,255,255,0.03)";
  const list = tags || [];
  const [draft, setDraft] = React.useState("");
  const add = raw => {
    const v = (raw || "").trim();
    setDraft("");
    if (!v) return;
    if (list.some(x => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...list, v]);
  };
  const remove = t => onChange(list.filter(x => x !== t));
  const chip = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 4px 3px 8px",
    borderRadius: 999,
    background: `color-mix(in oklab, ${color} 14%, transparent)`,
    border: `1px solid color-mix(in oklab, ${color} 45%, transparent)`,
    font: "500 11px/1 Inter, sans-serif",
    color: fg,
    whiteSpace: "nowrap",
  };
  const dlId = React.useId ? React.useId() : "tagsug";
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
        padding: 7,
        minHeight: 36,
        background: inputBg,
        border: `1px solid ${border}`,
        borderRadius: 6,
      }}
    >
      {list.map(t => (
        <span key={t} style={chip}>
          {t}
          <button
            onClick={() => remove(t)}
            title="Remove tag"
            style={{
              width: 15,
              height: 15,
              lineHeight: "13px",
              padding: 0,
              border: "none",
              borderRadius: 999,
              cursor: "pointer",
              background: "transparent",
              color: fgFaint,
              font: "13px/1 Inter, sans-serif",
            }}
            onPointerEnter={e => {
              e.currentTarget.style.color = fg;
            }}
            onPointerLeave={e => {
              e.currentTarget.style.color = fgFaint;
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        list={dlId}
        placeholder={list.length ? "add tag…" : "e.g. Sword, Electric…"}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && draft === "" && list.length) remove(list[list.length - 1]);
        }}
        onBlur={() => add(draft)}
        style={{
          flex: 1,
          minWidth: 70,
          padding: "2px 2px",
          background: "transparent",
          border: "none",
          outline: "none",
          color: fg,
          font: "12px/1.2 Inter, sans-serif",
        }}
      />
      <datalist id={dlId}>
        {(suggestions || [])
          .filter(s => !list.includes(s))
          .map(s => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}

// ---- Synergy rules — blank slate + "Add Synergy". Each rule is a tag the object
// reacts to, set to positive (bonus) or negative (penalty). ----
function SynergyRules({ synergies, onChange, theme, suggestions }) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgDim = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.5)";
  const fgFaint = isWarm ? "rgba(60,50,40,0.4)" : "rgba(255,255,255,0.35)";
  const border = isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.07)";
  const inputBg = isWarm ? "rgba(255,253,247,0.6)" : "rgba(255,255,255,0.03)";
  const accent = "oklch(0.78 0.12 195)";
  const danger = "oklch(0.7 0.18 25)";
  const rules = synergies || [];

  const setRule = (i, patch) => onChange(rules.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const removeRule = i => onChange(rules.filter((_, k) => k !== i));
  const addRule = () => onChange([...rules, { tag: "", positive: true }]);

  const dlId = React.useId ? React.useId() : "synsug";
  const fieldBase = {
    background: inputBg,
    border: `1px solid ${border}`,
    borderRadius: 4,
    color: fg,
    font: '500 11.5px/1.2 "JetBrains Mono", monospace',
    outline: "none",
  };

  return (
    <div>
      <datalist id={dlId}>
        {(suggestions || []).map(s => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {rules.length === 0 ? (
        <div
          style={{
            padding: "12px 10px",
            marginBottom: 8,
            borderRadius: 6,
            border: `1px dashed ${border}`,
            textAlign: "center",
            font: "11.5px/1.5 Inter, sans-serif",
            color: fgFaint,
          }}
        >
          No synergies yet. Add a tag this object reacts to.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {rules.map((r, i) => {
            const positive = r.positive !== false;
            return (
              <div
                key={i}
                style={{ display: "grid", gridTemplateColumns: "1fr 86px 22px", gap: 6, alignItems: "center" }}
              >
                <input
                  value={r.tag}
                  list={dlId}
                  placeholder="tag…"
                  onChange={e => setRule(i, { tag: e.target.value })}
                  style={{ ...fieldBase, padding: "5px 8px", font: "500 11.5px/1.2 Inter, sans-serif" }}
                />
                <button
                  onClick={() => setRule(i, { positive: !positive })}
                  title={positive ? "Bonus — click to make penalty" : "Penalty — click to make bonus"}
                  style={{
                    ...fieldBase,
                    padding: "5px 6px",
                    cursor: "pointer",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: positive ? accent : danger,
                    borderColor: `color-mix(in oklab, ${positive ? accent : danger} 40%, ${border})`,
                  }}
                >
                  {positive ? "+ bonus" : "− penalty"}
                </button>
                <button
                  onClick={() => removeRule(i)}
                  title="Remove synergy"
                  style={{
                    width: 22,
                    height: 26,
                    padding: 0,
                    cursor: "pointer",
                    background: "transparent",
                    border: `1px solid ${border}`,
                    borderRadius: 4,
                    color: fgFaint,
                    font: "14px/1 Inter, sans-serif",
                  }}
                  onPointerEnter={e => {
                    e.currentTarget.style.color = danger;
                    e.currentTarget.style.borderColor = danger;
                  }}
                  onPointerLeave={e => {
                    e.currentTarget.style.color = fgFaint;
                    e.currentTarget.style.borderColor = border;
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button
        onClick={addRule}
        style={{
          width: "100%",
          padding: "7px 12px",
          cursor: "pointer",
          background: "transparent",
          border: `1px dashed ${isWarm ? "rgba(60,50,40,0.25)" : "rgba(255,255,255,0.18)"}`,
          borderRadius: 6,
          color: fgDim,
          font: "500 11.5px/1 Inter, sans-serif",
          letterSpacing: "0.02em",
          transition: "border-color 120ms, color 120ms",
        }}
        onPointerEnter={e => {
          e.currentTarget.style.borderColor = accent;
          e.currentTarget.style.color = accent;
        }}
        onPointerLeave={e => {
          e.currentTarget.style.borderColor = isWarm ? "rgba(60,50,40,0.25)" : "rgba(255,255,255,0.18)";
          e.currentTarget.style.color = fgDim;
        }}
      >
        + Add Synergy
      </button>
    </div>
  );
}

// ---- Selected: editable object-definition form ----
function SelectedEditor({ itemType, detail, theme, allTypes, onUpdateType, onDeleteType, onEditShape }) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgDim = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.5)";
  const fgFaint = isWarm ? "rgba(60,50,40,0.35)" : "rgba(255,255,255,0.32)";
  const border = isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.07)";
  const inputBg = isWarm ? "rgba(255,253,247,0.6)" : "rgba(255,255,255,0.03)";

  const inputStyle = {
    width: "100%",
    padding: "5px 8px",
    background: inputBg,
    border: `1px solid ${border}`,
    borderRadius: 4,
    color: fg,
    font: '500 11.5px/1.2 "JetBrains Mono", monospace',
    outline: "none",
    fontVariantNumeric: "tabular-nums",
  };
  const labelStyle = {
    font: '500 9px/1 "JetBrains Mono", monospace',
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: fgFaint,
  };

  const update = patch => onUpdateType(itemType.id, patch);

  // Suggest tags already defined anywhere in the catalog.
  const allTags = React.useMemo(() => {
    const set = new Set();
    for (const tt of allTypes || []) for (const tg of tt.tags || []) set.add(tg);
    return Array.from(set).sort();
  }, [allTypes]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div
          style={{
            width: 44,
            height: 44,
            padding: 7,
            border: `1px solid ${border}`,
            borderRadius: 6,
            background: inputBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Glyph kind={itemType.glyph} style="solid" color={itemType.color} w={1} h={1} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...labelStyle, marginBottom: 4 }}>Name</div>
          <TextField
            value={itemType.name}
            onChange={v => update({ name: v })}
            style={{ ...inputStyle, font: "500 13px/1.2 Inter, sans-serif" }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Tags</div>
        <TagChips
          tags={itemType.tags}
          color={itemType.color}
          theme={theme}
          suggestions={allTags}
          onChange={tags => update({ tags })}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ ...labelStyle, marginBottom: 4 }}>Shape</div>
        <button
          onClick={() => onEditShape && onEditShape(itemType)}
          style={{
            width: "100%",
            padding: "8px 12px",
            background: inputBg,
            border: `1px solid ${border}`,
            borderRadius: 6,
            cursor: "pointer",
            font: "500 12px/1 Inter, sans-serif",
            letterSpacing: "0.02em",
            color: fg,
            transition: "background 120ms, border-color 120ms",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
          onPointerEnter={e => {
            e.currentTarget.style.background = isWarm ? "rgba(255,253,247,0.85)" : "rgba(255,255,255,0.05)";
            e.currentTarget.style.borderColor = itemType.color;
          }}
          onPointerLeave={e => {
            e.currentTarget.style.background = inputBg;
            e.currentTarget.style.borderColor = border;
          }}
        >
          <span>Edit shape grid</span>
          <span style={{ color: fgDim, font: '11px/1 "JetBrains Mono", monospace' }}>
            {itemType.cells?.length || 1} cells
          </span>
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ ...labelStyle, marginBottom: 4 }}>Description</div>
        <TextField
          value={itemType.desc}
          onChange={v => update({ desc: v })}
          multiline
          style={{ ...inputStyle, font: "11px/1.4 Inter, sans-serif", resize: "vertical" }}
        />
      </div>

      <div>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Synergy with</div>
        <SynergyRules
          synergies={itemType.synergies}
          theme={theme}
          suggestions={allTags}
          onChange={synergies => update({ synergies })}
        />
      </div>

      {detail && (
        <div
          style={{
            marginTop: 14,
            padding: "8px 10px",
            border: `1px solid ${border}`,
            borderRadius: 5,
            background: inputBg,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            font: '500 11px/1 "JetBrains Mono", monospace',
            color: fgDim,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>this instance</span>
          <span style={{ color: fg }}>
            <span style={{ color: fgFaint }}>synergy</span>{" "}
            <span style={{ color: detail.total >= 0 ? "oklch(0.78 0.12 195)" : "oklch(0.7 0.18 25)", fontWeight: 600 }}>
              {detail.total >= 0 ? "+" : ""}
              {detail.total}
            </span>
          </span>
        </div>
      )}

      {onDeleteType && (
        <button
          onClick={() => onDeleteType(itemType.id)}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "8px 12px",
            background: "transparent",
            border: `1px solid ${isWarm ? "rgba(200,80,50,0.25)" : "rgba(255,100,80,0.18)"}`,
            borderRadius: 6,
            cursor: "pointer",
            font: "500 12px/1 Inter, sans-serif",
            letterSpacing: "0.02em",
            color: "oklch(0.7 0.18 25)",
            transition: "background 120ms, border-color 120ms",
          }}
          onPointerEnter={e => {
            e.currentTarget.style.background = isWarm ? "rgba(200,80,50,0.06)" : "rgba(255,100,80,0.06)";
            e.currentTarget.style.borderColor = "oklch(0.7 0.18 25)";
          }}
          onPointerLeave={e => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = isWarm ? "rgba(200,80,50,0.25)" : "rgba(255,100,80,0.18)";
          }}
        >
          Delete definition
        </button>
      )}
    </div>
  );
}

// ---- NumberField ----
function NumberField({ value, onCommit, allowNegative, style }) {
  const [draft, setDraft] = React.useState(String(value ?? 0));
  const focusRef = React.useRef(false);
  React.useEffect(() => {
    if (!focusRef.current) setDraft(String(value ?? 0));
  }, [value]);
  const sanitize = s => {
    const re = allowNegative ? /[^0-9-]/g : /[^0-9]/g;
    let out = s.replace(re, "");
    if (allowNegative) {
      const neg = out.startsWith("-");
      out = (neg ? "-" : "") + out.replace(/-/g, "");
    }
    return out;
  };
  return (
    <input
      value={draft}
      onFocus={() => {
        focusRef.current = true;
      }}
      onChange={e => {
        const s = sanitize(e.target.value);
        setDraft(s);
        if (s === "" || s === "-") return;
        const n = parseInt(s, 10);
        if (Number.isFinite(n) && n !== value) onCommit(n);
      }}
      onBlur={() => {
        focusRef.current = false;
        const n = parseInt(draft, 10);
        if (!Number.isFinite(n)) setDraft(String(value ?? 0));
        else {
          setDraft(String(n));
          if (n !== value) onCommit(n);
        }
      }}
      style={style}
    />
  );
}

function ColorField({ value, onCommit, theme, inputBg, border, fg }) {
  const [draft, setDraft] = React.useState(value);
  const focusRef = React.useRef(false);
  React.useEffect(() => {
    if (!focusRef.current) setDraft(value);
  }, [value]);
  const isHex = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input
        type="color"
        value={isHex ? value : "#5eead4"}
        onChange={e => {
          onCommit(e.target.value);
          setDraft(e.target.value);
        }}
        style={{
          width: 28,
          height: 28,
          padding: 0,
          border: `1px solid ${border}`,
          borderRadius: 4,
          background: inputBg,
          cursor: "pointer",
        }}
      />
      <input
        value={draft}
        onFocus={() => {
          focusRef.current = true;
        }}
        onChange={e => {
          setDraft(e.target.value);
          onCommit(e.target.value);
        }}
        onBlur={() => {
          focusRef.current = false;
          setDraft(value);
        }}
        style={{
          flex: 1,
          padding: "5px 8px",
          background: inputBg,
          border: `1px solid ${border}`,
          borderRadius: 4,
          color: fg,
          font: '500 10px/1.2 "JetBrains Mono", monospace',
          outline: "none",
          minWidth: 0,
        }}
      />
    </div>
  );
}

// ---- ScorePanel ----
function ScorePanel({
  scoreData,
  placements,
  selectedIds,
  selectedTypeId,
  theme,
  optimizing,
  onImport,
  onExport,
  onOptimize,
  itemTypes,
  typeById,
  onUpdateType,
  onDeleteType,
  onEditShape,
  highlightedTypeId,
  onHoverTypeId,
}) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgDim = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.5)";
  const fgFaint = isWarm ? "rgba(60,50,40,0.35)" : "rgba(255,255,255,0.32)";
  const border = isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.07)";
  const surfaceSubtle = isWarm ? "#f0ebde" : "rgba(0,0,0,0.18)";

  const total = scoreData?.total ?? 0;
  const perType = {};
  for (const p of placements) {
    const tt = typeById[p.type];
    if (!tt) continue;
    perType[p.type] = perType[p.type] || { count: 0, bonus: 0, color: tt.color, name: tt.name };
    perType[p.type].count += 1;
    perType[p.type].bonus += scoreData?.perItem[p.id]?.bonus ?? 0;
  }

  const selectedPlacement = selectedIds.length === 1 ? placements.find(p => p.id === selectedIds[0]) : null;
  const editingTypeId = selectedPlacement?.type ?? selectedTypeId;
  const editingType = editingTypeId ? typeById[editingTypeId] : null;
  const selectedDetail = selectedPlacement ? scoreData?.perItem[selectedPlacement.id] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <div style={{ padding: "14px 18px 18px", borderBottom: `1px solid ${border}` }}>
          <div
            style={{
              font: '500 10px/1 "JetBrains Mono", monospace',
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: fgFaint,
              marginBottom: 8,
            }}
          >
            Total Score
          </div>
          <div
            style={{
              font: "300 56px/1 Inter, sans-serif",
              color: fg,
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {total}
          </div>
          <div style={{ marginTop: 8, font: "12px/1.5 Inter, sans-serif", color: fgDim }}>
            {placements.length} {placements.length === 1 ? "item" : "items"} •{" "}
            {(() => {
              const c = findClusters(placements).length;
              return `${c} ${c === 1 ? "cluster" : "clusters"}`;
            })()}
          </div>
        </div>

        <PanelSection label="Composition" theme={theme}>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {Object.entries(perType)
              .sort((a, b) => b[1].bonus - a[1].bonus)
              .map(([id, info]) => {
                const isHl = highlightedTypeId === id;
                return (
                  <div
                    key={id}
                    onPointerEnter={() => onHoverTypeId && onHoverTypeId(id)}
                    onPointerLeave={() => onHoverTypeId && onHoverTypeId(null)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "14px 1fr auto",
                      gap: 10,
                      alignItems: "center",
                      borderRadius: 4,
                      padding: "5px 4px",
                      margin: "0 -4px",
                      background: isHl ? `color-mix(in oklab, ${info.color} 12%, transparent)` : "transparent",
                      transition: "background 120ms",
                      cursor: "default",
                    }}
                  >
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: info.color,
                        boxShadow: isHl ? `0 0 8px 2px color-mix(in oklab, ${info.color} 33%, transparent)` : "none",
                        transition: "box-shadow 160ms",
                      }}
                    />
                    <div style={{ font: "12px/1 Inter, sans-serif", color: fg }}>
                      {info.name} <span style={{ color: fgFaint }}>×{info.count}</span>
                    </div>
                    <div
                      style={{
                        font: '500 11px/1 "JetBrains Mono", monospace',
                        color: info.bonus >= 0 ? "oklch(0.78 0.12 195)" : "oklch(0.7 0.18 25)",
                        fontVariantNumeric: "tabular-nums",
                        width: 32,
                        textAlign: "right",
                      }}
                    >
                      {info.bonus >= 0 ? "+" : ""}
                      {info.bonus}
                    </div>
                  </div>
                );
              })}
          </div>
        </PanelSection>

        {editingType && (
          <PanelSection label={selectedPlacement ? "Edit definition" : "Edit type"} theme={theme}>
            <SelectedEditor
              itemType={editingType}
              detail={selectedDetail}
              theme={theme}
              allTypes={itemTypes}
              onUpdateType={onUpdateType}
              onDeleteType={onDeleteType}
              onEditShape={onEditShape}
            />
          </PanelSection>
        )}
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: 14,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
          borderTop: `1px solid ${border}`,
          background: surfaceSubtle,
          backdropFilter: "blur(8px)",
        }}
      >
        <button onClick={onImport} style={btnStyle(theme, "ghost")}>
          Import
        </button>
        <button onClick={onExport} style={btnStyle(theme, "ghost")}>
          Export
        </button>
        <button onClick={onOptimize} disabled={optimizing} style={btnStyle(theme, "primary", optimizing)}>
          {optimizing ? "Solving…" : "Optimize"}
        </button>
      </div>
    </div>
  );
}

function btnStyle(theme, kind, disabled) {
  const isWarm = theme === "warm";
  const accent = "oklch(0.78 0.12 195)";
  if (kind === "primary") {
    return {
      padding: "8px 12px",
      background: disabled ? (isWarm ? "rgba(60,50,40,0.08)" : "rgba(255,255,255,0.05)") : accent,
      color: disabled ? (isWarm ? "rgba(60,50,40,0.4)" : "rgba(255,255,255,0.3)") : "#0e1116",
      border: "none",
      borderRadius: 6,
      font: "500 12px/1 Inter, sans-serif",
      letterSpacing: "0.02em",
      cursor: disabled ? "not-allowed" : "pointer",
    };
  }
  return {
    padding: "8px 12px",
    background: "transparent",
    color: disabled
      ? isWarm
        ? "rgba(60,50,40,0.3)"
        : "rgba(255,255,255,0.25)"
      : isWarm
        ? "#3a2f22"
        : "rgba(255,255,255,0.85)",
    border: `1px solid ${isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)"}`,
    borderRadius: 6,
    font: "500 12px/1 Inter, sans-serif",
    letterSpacing: "0.02em",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

// ---- Inline Grid Size Controls (no popup, auto-apply, safe resize) ----
function GridSizeControls({ gridW, gridH, onChangeW, onChangeH, theme }) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgFaint = isWarm ? "rgba(60,50,40,0.4)" : "rgba(255,255,255,0.35)";
  const border = isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 32,
        padding: "0 10px",
        border: `1px solid ${border}`,
        borderRadius: 5,
      }}
    >
      <span
        style={{
          color: fgFaint,
          font: '500 10px/1 "JetBrains Mono", monospace',
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        grid
      </span>
      <InlineStep value={gridW} onChange={onChangeW} min={2} max={20} theme={theme} />
      <span style={{ color: fgFaint, font: "12px/1 Inter, sans-serif" }}>×</span>
      <InlineStep value={gridH} onChange={onChangeH} min={2} max={20} theme={theme} />
    </div>
  );
}

function InlineStep({ value, onChange, min, max, theme }) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const border = isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <button onClick={() => onChange(Math.max(min, value - 1))} style={inlineStepBtn(theme)} title="Decrease">
        −
      </button>
      <span
        style={{
          width: 22,
          textAlign: "center",
          font: '500 12px/1 "JetBrains Mono", monospace',
          color: fg,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      <button onClick={() => onChange(Math.min(max, value + 1))} style={inlineStepBtn(theme)} title="Increase">
        +
      </button>
    </div>
  );
}

function inlineStepBtn(theme) {
  const isWarm = theme === "warm";
  return {
    width: 20,
    height: 20,
    background: "transparent",
    border: `1px solid ${isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)"}`,
    borderRadius: 3,
    color: isWarm ? "#3a2f22" : "rgba(255,255,255,0.85)",
    font: '500 11px/1 "JetBrains Mono", monospace',
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };
}

// ---- Zoom slider ----
function ZoomSlider({ value, onChange, theme }) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgFaint = isWarm ? "rgba(60,50,40,0.4)" : "rgba(255,255,255,0.35)";
  const border = isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 10px",
        height: 32,
        border: `1px solid ${border}`,
        borderRadius: 5,
      }}
      title="Zoom"
    >
      <span
        style={{
          color: fgFaint,
          font: '500 10px/1 "JetBrains Mono", monospace',
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        zoom
      </span>
      <input
        type="range"
        min={100}
        max={200}
        step={5}
        value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        style={{ width: 80, accentColor: "oklch(0.78 0.12 195)" }}
      />
      <span
        style={{
          color: fg,
          font: '500 11px/1 "JetBrains Mono", monospace',
          fontVariantNumeric: "tabular-nums",
          width: 36,
          textAlign: "right",
        }}
      >
        {value}%
      </span>
    </div>
  );
}

// ---- Inline tweaks group in topbar ----
function ToggleGroup({ value, options, onChange, theme, title }) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgDim = isWarm ? "rgba(60,50,40,0.5)" : "rgba(255,255,255,0.4)";
  const border = isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)";
  const accent = "oklch(0.78 0.12 195)";
  const bgSel = isWarm ? "rgba(94,234,212,0.12)" : "rgba(94,234,212,0.08)";
  return (
    <div
      title={title}
      style={{
        display: "inline-flex",
        border: `1px solid ${border}`,
        borderRadius: 5,
        overflow: "hidden",
        background: "transparent",
        height: 32,
      }}
    >
      {options.map((opt, i) => {
        const sel = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            title={opt.title || opt.label}
            style={{
              width: 30,
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: sel ? bgSel : "transparent",
              color: sel ? accent : fgDim,
              border: "none",
              borderLeft: i === 0 ? "none" : `1px solid ${border}`,
              cursor: "pointer",
              transition: "background 120ms, color 120ms",
            }}
            onPointerEnter={e => {
              if (!sel) e.currentTarget.style.color = fg;
            }}
            onPointerLeave={e => {
              if (!sel) e.currentTarget.style.color = fgDim;
            }}
          >
            {opt.icon}
          </button>
        );
      })}
    </div>
  );
}

// SVG icons for topbar
const Sun = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
    {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
      const a = (i * Math.PI) / 4;
      return (
        <line
          key={i}
          x1={8 + Math.cos(a) * 5.2}
          y1={8 + Math.sin(a) * 5.2}
          x2={8 + Math.cos(a) * 6.8}
          y2={8 + Math.sin(a) * 6.8}
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      );
    })}
  </svg>
);

const Moon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path
      d="M11.8 10.5a4.5 4.5 0 0 1-6.3-6.3 5.2 5.2 0 1 0 6.3 6.3z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

const SolidIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16">
    <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" />
  </svg>
);

const OutlineIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

const EdgesIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="2.5" y="2.5" width="5" height="5" stroke="currentColor" strokeWidth="1.4" />
    <rect x="8.5" y="8.5" width="5" height="5" stroke="currentColor" strokeWidth="1.4" />
    <line x1="7.5" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.4" />
    <line x1="5" y1="7.5" x2="5" y2="9" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

const GraphIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.4" />
    <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="4" cy="4" r="1.6" fill="currentColor" />
    <circle cx="12" cy="4" r="1.6" fill="currentColor" />
    <circle cx="4" cy="12" r="1.6" fill="currentColor" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
  </svg>
);

// Highlight-style icons: a ringed shape (halo) vs. one solid shape among faded ones (dim)
const HaloIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="4.5" y="4.5" width="7" height="7" rx="1.4" fill="currentColor" />
    <rect x="1.8" y="1.8" width="12.4" height="12.4" rx="3" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
  </svg>
);

const DimIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" />
    <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" opacity="0.25" />
    <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" opacity="0.25" />
    <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" opacity="0.25" />
  </svg>
);

function InlineTweaks({ t, setTweak, theme }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <ToggleGroup
        theme={theme}
        title="Color scheme"
        value={t.theme}
        onChange={v => setTweak("theme", v)}
        options={[
          { value: "dark", icon: <Moon />, title: "Dark" },
          { value: "warm", icon: <Sun />, title: "Warm" },
        ]}
      />
      <ToggleGroup
        theme={theme}
        title="Icon style"
        value={t.iconStyle}
        onChange={v => setTweak("iconStyle", v)}
        options={[
          { value: "solid", icon: <SolidIcon />, title: "Solid" },
          { value: "glyph", icon: <OutlineIcon />, title: "Outline" },
        ]}
      />
      <ToggleGroup
        theme={theme}
        title="Bonus visualization"
        value={t.vizMode === "aura" ? "lines" : t.vizMode}
        onChange={v => setTweak("vizMode", v)}
        options={[
          { value: "edges", icon: <EdgesIcon />, title: "Edges" },
          { value: "lines", icon: <GraphIcon />, title: "Graph" },
        ]}
      />
    </div>
  );
}

// Random name generator — uses assigned combo's color and shape names
function getComboName(combo) {
  if (!combo) return "New Object";
  const colorName = COLOR_NAMES[combo.color] || "Unknown";
  const glyphName = GLYPH_NAMES[combo.glyph] || "Shape";
  return `${colorName} ${glyphName}`;
}

// ---- New Object modal (simplified, auto-assigns combo) ----
function NewTypeModal({ open, onClose, onCreate, theme }) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgDim = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.5)";
  const fgFaint = isWarm ? "rgba(60,50,40,0.4)" : "rgba(255,255,255,0.35)";
  const border = isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)";
  const surface = isWarm ? "#fbf8f0" : "#141a23";
  const inputBg = isWarm ? "rgba(255,253,247,0.6)" : "rgba(255,255,255,0.03)";
  const cellBorder = isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.08)";
  const cellBg = isWarm ? "rgba(255,253,247,0.5)" : "rgba(255,255,255,0.02)";
  const accent = "oklch(0.78 0.12 195)";

  const [name, setName] = React.useState("");
  const [count, setCount] = React.useState(1);
  const [assignedCombo, setAssignedCombo] = React.useState(null);
  const [cells, setCells] = React.useState([]);

  React.useEffect(() => {
    if (open) {
      const combo = getNextAvailableCombo(window.__TYPES || []);
      if (!combo) {
        onClose();
        return;
      }
      setAssignedCombo(combo);
      setCells(combo.cells);
      setName(getComboName(combo));
      setCount(1);
    }
  }, [open, onClose]);

  if (!open) return null;

  const inputStyle = {
    width: "100%",
    padding: "6px 9px",
    background: inputBg,
    border: `1px solid ${border}`,
    borderRadius: 5,
    color: fg,
    font: '500 12px/1.2 "JetBrains Mono", monospace',
    outline: "none",
  };
  const labelStyle = {
    font: '500 9px/1 "JetBrains Mono", monospace',
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: fgFaint,
    marginBottom: 4,
  };

  const toggleCell = (cx, cy) => {
    const exists = cells.some(([x, y]) => x === cx && y === cy);
    if (exists) {
      const next = cells.filter(([x, y]) => !(x === cx && y === cy));
      if (next.length > 0) setCells(next);
    } else {
      setCells([...cells, [cx, cy]]);
    }
  };

  const submit = () => {
    if (!assignedCombo || cells.length === 0) return;
    // Normalize to origin
    const minX = Math.min(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    const normalized = cells.map(([x, y]) => [x - minX, y - minY]);

    const id = (name.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "type_") + Date.now().toString(36).slice(-3);
    onCreate(
      {
        id,
        name: name || "Untitled",
        glyph: assignedCombo.glyph,
        color: assignedCombo.color,
        cells: normalized,
        tags: [],
        desc: "",
        synergies: [],
      },
      parseInt(count, 10) || 0,
    );
    onClose();
  };

  const cellSize = 44;
  const gap = 4;
  const gridSize = 5;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 400,
          padding: 20,
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 10,
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ font: "600 15px/1.3 Inter, sans-serif", color: fg }}>New Object</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ ...labelStyle, marginBottom: 4 }}>Name</div>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ ...inputStyle, font: "500 13px/1.2 Inter, sans-serif" }}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>Quantity</div>
          <input type="number" value={count} onChange={e => setCount(e.target.value)} style={inputStyle} />
        </div>

        {/* Shape editor */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Shape</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${gridSize}, ${cellSize}px)`,
              gap: gap,
              justifyContent: "center",
            }}
          >
            {Array.from({ length: gridSize * gridSize }, (_, i) => {
              const cy = Math.floor(i / gridSize);
              const cx = i % gridSize;
              const isActive = cells.some(([x, y]) => x === cx && y === cy);
              return (
                <button
                  key={i}
                  onClick={() => toggleCell(cx, cy)}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    border: `1px solid ${isActive ? assignedCombo?.color : cellBorder}`,
                    borderRadius: 6,
                    background: isActive
                      ? `color-mix(in oklab, ${assignedCombo?.color || "transparent"} 13%, transparent)`
                      : cellBg,
                    cursor: "pointer",
                    transition: "all 140ms ease",
                    position: "relative",
                  }}
                  onPointerEnter={e => {
                    if (!isActive && assignedCombo) {
                      e.currentTarget.style.borderColor = assignedCombo.color;
                      e.currentTarget.style.background = `color-mix(in oklab, ${assignedCombo.color} 7%, transparent)`;
                    }
                  }}
                  onPointerLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = cellBorder;
                      e.currentTarget.style.background = cellBg;
                    }
                  }}
                >
                  {isActive && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: assignedCombo?.color,
                        fontSize: "18px",
                        fontWeight: 600,
                      }}
                    >
                      ✓
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 8,
              font: '11px/1.4 "JetBrains Mono", monospace',
              color: fgDim,
              textAlign: "center",
            }}
          >
            {cells.length} cell{cells.length === 1 ? "" : "s"} selected
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnStyle(theme, "ghost")}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={cells.length === 0}
            style={{
              ...btnStyle(theme, "primary", cells.length === 0),
              padding: "8px 18px",
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Delete Type Confirmation Modal ----
function DeleteTypeModal({ open, itemType, placementCount, onConfirm, onClose, theme }) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgDim = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.5)";
  const fgFaint = isWarm ? "rgba(60,50,40,0.4)" : "rgba(255,255,255,0.35)";
  const border = isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)";
  const surface = isWarm ? "#fbf8f0" : "#141a23";
  const dangerColor = "oklch(0.7 0.18 25)";

  React.useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onConfirm, onClose]);

  if (!open || !itemType) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 360,
          padding: 22,
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 10,
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, flexShrink: 0 }}>
            <Glyph kind={itemType.glyph} style="solid" color={itemType.color} w={1} h={1} />
          </div>
          <div>
            <div style={{ font: "600 14px/1.3 Inter, sans-serif", color: fg }}>Delete "{itemType.name}"?</div>
            <div style={{ font: "12px/1.4 Inter, sans-serif", color: fgDim, marginTop: 3 }}>
              This will remove the object definition
              {placementCount > 0
                ? ` and ${placementCount} placed instance${placementCount === 1 ? "" : "s"} from the grid`
                : ""}
              .
            </div>
          </div>
        </div>

        {placementCount > 0 && (
          <div
            style={{
              padding: "8px 10px",
              marginBottom: 16,
              background: isWarm ? "rgba(200,80,50,0.06)" : "rgba(255,100,80,0.06)",
              border: `1px solid ${isWarm ? "rgba(200,80,50,0.15)" : "rgba(255,100,80,0.12)"}`,
              borderRadius: 6,
              font: "11.5px/1.4 Inter, sans-serif",
              color: dangerColor,
            }}
          >
            {placementCount} instance{placementCount === 1 ? "" : "s"} on the grid will be removed.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnStyle(theme, "ghost")}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 18px",
              background: dangerColor,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              font: "500 12px/1 Inter, sans-serif",
              letterSpacing: "0.02em",
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Shape Conflict Modal ----
function ShapeConflictModal({ open, itemType, conflictCount, onRemoveConflicts, onClose, theme }) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgDim = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.5)";
  const border = isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)";
  const surface = isWarm ? "#fbf8f0" : "#141a23";
  const warningColor = "oklch(0.78 0.13 60)";

  React.useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !itemType) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1001,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 380,
          padding: 22,
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 10,
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, flexShrink: 0 }}>
            <Glyph kind={itemType.glyph} style="solid" color={itemType.color} w={1} h={1} />
          </div>
          <div>
            <div style={{ font: "600 14px/1.3 Inter, sans-serif", color: fg }}>Shape Change Conflict</div>
            <div style={{ font: "12px/1.4 Inter, sans-serif", color: fgDim, marginTop: 3 }}>
              The new shape would overlap existing objects
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "10px 12px",
            marginBottom: 18,
            background: isWarm ? "rgba(217,119,87,0.08)" : "rgba(217,119,87,0.08)",
            border: `1px solid ${isWarm ? "rgba(217,119,87,0.2)" : "rgba(217,119,87,0.15)"}`,
            borderRadius: 6,
            font: "12px/1.5 Inter, sans-serif",
            color: fg,
          }}
        >
          <div style={{ marginBottom: 6 }}>
            <strong>{conflictCount}</strong> {itemType.name} instance{conflictCount === 1 ? "" : "s"} would overlap with
            other objects or go out of bounds.
          </div>
          <div style={{ color: fgDim, fontSize: "11px" }}>
            You can remove the conflicting objects and apply the new shape, or cancel to keep everything as-is.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnStyle(theme, "ghost")}>
            Cancel
          </button>
          <button
            onClick={onRemoveConflicts}
            style={{
              padding: "8px 18px",
              background: warningColor,
              color: isWarm ? "#2a1f15" : "#0e1116",
              border: "none",
              borderRadius: 6,
              font: "500 12px/1 Inter, sans-serif",
              letterSpacing: "0.02em",
              cursor: "pointer",
            }}
          >
            Remove & Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Shape Editor Modal (5×5 grid for custom shapes) ----
function ShapeEditorModal({ open, itemType, onSave, onClose, theme }) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgDim = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.5)";
  const border = isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)";
  const surface = isWarm ? "#fbf8f0" : "#141a23";
  const cellBorder = isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.08)";
  const cellBg = isWarm ? "rgba(255,253,247,0.5)" : "rgba(255,255,255,0.02)";
  const accent = "oklch(0.78 0.12 195)";

  const [cells, setCells] = React.useState([]);

  React.useEffect(() => {
    if (open && itemType) {
      setCells(itemType.cells || [[0, 0]]);
    }
  }, [open, itemType]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !itemType) return null;

  const toggleCell = (cx, cy) => {
    const key = `${cx},${cy}`;
    const exists = cells.some(([x, y]) => x === cx && y === cy);
    if (exists) {
      const next = cells.filter(([x, y]) => !(x === cx && y === cy));
      if (next.length > 0) setCells(next);
    } else {
      setCells([...cells, [cx, cy]]);
    }
  };

  const handleSave = () => {
    if (cells.length === 0) return;
    // Normalize to origin
    const minX = Math.min(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    const normalized = cells.map(([x, y]) => [x - minX, y - minY]);
    onSave(normalized);
    onClose();
  };

  const cellSize = 44;
  const gap = 4;
  const gridSize = 5;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 400,
          padding: 22,
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 10,
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <div style={{ font: "600 15px/1.3 Inter, sans-serif", color: fg, marginBottom: 4 }}>
            Edit Shape: {itemType.name}
          </div>
          <div style={{ font: "11.5px/1.4 Inter, sans-serif", color: fgDim }}>Click tiles to enable/disable cells</div>
        </div>

        {/* 5×5 grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${gridSize}, ${cellSize}px)`,
            gap: gap,
            marginBottom: 20,
            justifyContent: "center",
          }}
        >
          {Array.from({ length: gridSize * gridSize }, (_, i) => {
            const cy = Math.floor(i / gridSize);
            const cx = i % gridSize;
            const isActive = cells.some(([x, y]) => x === cx && y === cy);
            return (
              <button
                key={i}
                onClick={() => toggleCell(cx, cy)}
                style={{
                  width: cellSize,
                  height: cellSize,
                  border: `1px solid ${isActive ? itemType.color : cellBorder}`,
                  borderRadius: 6,
                  background: isActive ? `color-mix(in oklab, ${itemType.color} 13%, transparent)` : cellBg,
                  cursor: "pointer",
                  transition: "all 140ms ease",
                  position: "relative",
                }}
                onPointerEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = itemType.color;
                    e.currentTarget.style.background = `color-mix(in oklab, ${itemType.color} 7%, transparent)`;
                  }
                }}
                onPointerLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = cellBorder;
                    e.currentTarget.style.background = cellBg;
                  }
                }}
              >
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: itemType.color,
                      fontSize: "18px",
                      fontWeight: 600,
                    }}
                  >
                    ✓
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div
          style={{
            padding: "8px 10px",
            marginBottom: 16,
            background: isWarm ? "rgba(60,50,40,0.06)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${border}`,
            borderRadius: 6,
            font: '11px/1.4 "JetBrains Mono", monospace',
            color: fgDim,
          }}
        >
          {cells.length} cell{cells.length === 1 ? "" : "s"} selected
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnStyle(theme, "ghost")}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={cells.length === 0}
            style={{
              ...btnStyle(theme, "primary", cells.length === 0),
              padding: "8px 18px",
            }}
          >
            Save Shape
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Footer shortcuts ----
function KeyIcon({ children, theme, wide, large }) {
  const isWarm = theme === "warm";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: wide ? 38 : 24,
        height: 24,
        padding: wide ? "0 7px" : "0 4px",
        border: `1px solid ${isWarm ? "rgba(60,50,40,0.28)" : "rgba(255,255,255,0.2)"}`,
        borderBottom: `2px solid ${isWarm ? "rgba(60,50,40,0.36)" : "rgba(255,255,255,0.28)"}`,
        borderRadius: 4,
        background: isWarm ? "rgba(255,253,247,0.7)" : "rgba(255,255,255,0.05)",
        font: `${large ? 600 : 500} ${large ? 14 : 10}px/1 "JetBrains Mono", monospace`,
        color: isWarm ? "rgba(60,50,40,0.9)" : "rgba(255,255,255,0.92)",
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function ShortcutsRow({ theme }) {
  const isWarm = theme === "warm";
  const fgDim = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.5)";
  const Plus = () => <span style={{ margin: "0 4px", color: fgDim, font: "11px/1 Inter, sans-serif" }}>+</span>;
  const items = [
    { keys: <KeyIcon theme={theme}>R</KeyIcon>, label: "rotate" },
    {
      keys: (
        <>
          <KeyIcon theme={theme} large>
            ⌥
          </KeyIcon>
          <Plus />
          <KeyIcon theme={theme} wide>
            click
          </KeyIcon>
        </>
      ),
      label: "disable cell",
    },
    {
      keys: (
        <>
          <KeyIcon theme={theme} large>
            ⇧
          </KeyIcon>
          <Plus />
          <KeyIcon theme={theme} wide>
            drag
          </KeyIcon>
        </>
      ),
      label: "add to selection",
    },
    {
      keys: (
        <KeyIcon theme={theme} wide>
          Del
        </KeyIcon>
      ),
      label: "remove",
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        gap: 26,
        flexWrap: "wrap",
        marginTop: 14,
      }}
    >
      {items.map((it, i) => (
        <div key={i} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center" }}>{it.keys}</span>
          <span style={{ font: "400 11px/1 Inter, sans-serif", color: fgDim }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  Tray,
  ScorePanel,
  GridSizeControls,
  ZoomSlider,
  NewTypeModal,
  DeleteTypeModal,
  ShapeEditorModal,
  ShapeConflictModal,
  ShortcutsRow,
  InlineTweaks,
  GlyphPicker,
  GlyphIconButton,
  NumberField,
  TextField,
  PanelSection,
});
