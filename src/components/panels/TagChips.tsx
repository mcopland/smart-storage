import { useId, useState, type CSSProperties } from "react";
import { ELLIPSIS, TIMES } from "./chars";

// Tag chips: the strings an object carries (e.g. "Sword", "Electric")
export function TagChips({
  tags,
  onChange,
  theme,
  color,
  suggestions,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  theme: string;
  color: string;
  suggestions?: string[];
}) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgFaint = isWarm ? "rgba(60,50,40,0.4)" : "rgba(255,255,255,0.35)";
  const border = isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.07)";
  const inputBg = isWarm ? "rgba(255,253,247,0.6)" : "rgba(255,255,255,0.03)";
  const list = tags || [];
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const v = (raw || "").trim();
    setDraft("");
    if (!v) return;
    if (list.some(x => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...list, v]);
  };
  const remove = (t: string) => onChange(list.filter(x => x !== t));
  const chip: CSSProperties = {
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
  const dlId = useId();
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
            {TIMES}
          </button>
        </span>
      ))}
      <input
        value={draft}
        list={dlId}
        placeholder={list.length ? `add tag${ELLIPSIS}` : `e.g. Sword, Electric${ELLIPSIS}`}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && draft === "" && list.length)
            remove(list[list.length - 1]);
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
