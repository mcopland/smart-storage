import type { ReactNode } from "react";
import type { SetTweak, Tweaks } from "../../useTweaks";
import { ACCENT } from "./styles";

interface ToggleOption<V extends string> {
  value: V;
  icon: ReactNode;
  title?: string;
}

function ToggleGroup<V extends string>({
  value,
  options,
  onChange,
  theme,
  title,
}: {
  value: V;
  options: ToggleOption<V>[];
  onChange: (v: V) => void;
  theme: string;
  title?: string;
}) {
  const isWarm = theme === "warm";
  const fg = isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)";
  const fgDim = isWarm ? "rgba(60,50,40,0.5)" : "rgba(255,255,255,0.4)";
  const border = isWarm ? "rgba(60,50,40,0.15)" : "rgba(255,255,255,0.1)";
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
            title={opt.title}
            style={{
              width: 30,
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: sel ? bgSel : "transparent",
              color: sel ? ACCENT : fgDim,
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

// Show Edges: two connected nodes joined by a clear solid line.
const EdgesIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <line
      x1="4.2"
      y1="4.2"
      x2="11.8"
      y2="11.8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle cx="4.2" cy="4.2" r="2.3" fill="currentColor" />
    <circle cx="11.8" cy="11.8" r="2.3" fill="currentColor" />
  </svg>
);

// Hide Edges: two nodes whose connecting edge is struck through; the link is off.
const EdgesHoverIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <line
      x1="4.2"
      y1="4.2"
      x2="11.8"
      y2="11.8"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      opacity="0.3"
      strokeDasharray="2 1.8"
    />
    <circle cx="4.2" cy="4.2" r="2.3" fill="currentColor" opacity="0.85" />
    <circle cx="11.8" cy="11.8" r="2.3" fill="currentColor" opacity="0.85" />
    <line
      x1="12.6"
      y1="3.4"
      x2="3.4"
      y2="12.6"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export function InlineTweaks({
  t,
  setTweak,
  theme,
}: {
  t: Tweaks;
  setTweak: SetTweak;
  theme: string;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <ToggleGroup
        theme={theme}
        title="Color scheme"
        value={t.theme}
        onChange={v => setTweak("theme", v)}
        options={[
          { value: "dark", icon: <Moon />, title: "Dark" },
          { value: "warm", icon: <Sun />, title: "Light" },
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
        title="Connecting edges"
        value={t.vizMode === "focus" ? "focus" : "edges"}
        onChange={v => setTweak("vizMode", v)}
        options={[
          { value: "edges", icon: <EdgesIcon />, title: "Show Edges" },
          { value: "focus", icon: <EdgesHoverIcon />, title: "Hide Edges" },
        ]}
      />
    </div>
  );
}
