import { useId, type CSSProperties } from "react";
import type { Synergy } from "../../model/types";
import { ELLIPSIS, MINUS, TIMES } from "./chars";
import { ACCENT, DANGER } from "./styles";

// Synergy rules: blank slate + "Add Synergy". Each rule is a tag the object
// reacts to, set to positive (bonus) or negative (penalty).
export function SynergyRules({
  synergies,
  onChange,
  theme,
  suggestions,
}: {
  synergies: Synergy[];
  onChange: (rules: Synergy[]) => void;
  theme: string;
  suggestions?: string[];
}) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgDim = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.5)";
  const fgFaint = isWarm ? "rgba(60,50,40,0.4)" : "rgba(255,255,255,0.35)";
  const border = isWarm ? "rgba(60,50,40,0.12)" : "rgba(255,255,255,0.07)";
  const inputBg = isWarm ? "rgba(255,253,247,0.6)" : "rgba(255,255,255,0.03)";
  const accent = ACCENT;
  const danger = DANGER;
  const rules = synergies || [];

  const setRule = (i: number, patch: Partial<Synergy>) =>
    onChange(rules.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const removeRule = (i: number) => onChange(rules.filter((_, k) => k !== i));
  const addRule = () => onChange([...rules, { tag: "", positive: true }]);

  const dlId = useId();
  const fieldBase: CSSProperties = {
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
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 86px 22px",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <input
                  value={r.tag}
                  list={dlId}
                  placeholder={`tag${ELLIPSIS}`}
                  onChange={e => setRule(i, { tag: e.target.value })}
                  style={{
                    ...fieldBase,
                    padding: "5px 8px",
                    font: "500 11.5px/1.2 Inter, sans-serif",
                  }}
                />
                <button
                  onClick={() => setRule(i, { positive: !positive })}
                  title={
                    positive ? "Bonus - click to make penalty" : "Penalty - click to make bonus"
                  }
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
                  {positive ? "+ bonus" : `${MINUS} penalty`}
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
                  {TIMES}
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
          e.currentTarget.style.borderColor = isWarm
            ? "rgba(60,50,40,0.25)"
            : "rgba(255,255,255,0.18)";
          e.currentTarget.style.color = fgDim;
        }}
      >
        + Add Synergy
      </button>
    </div>
  );
}
