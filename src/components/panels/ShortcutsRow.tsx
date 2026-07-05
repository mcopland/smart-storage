import type { ReactNode } from "react";
import { KEY_OPTION, KEY_SHIFT } from "./chars";

function KeyIcon({
  children,
  theme,
  wide,
  large,
}: {
  children: ReactNode;
  theme: string;
  wide?: boolean;
  large?: boolean;
}) {
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

function Plus({ color }: { color: string }) {
  return <span style={{ margin: "0 4px", color, font: "11px/1 Inter, sans-serif" }}>+</span>;
}

// Footer shortcuts
export function ShortcutsRow({ theme }: { theme: string }) {
  const isWarm = theme === "warm";
  const fgDim = isWarm ? "rgba(60,50,40,0.55)" : "rgba(255,255,255,0.5)";
  const items = [
    { keys: <KeyIcon theme={theme}>R</KeyIcon>, label: "rotate" },
    {
      keys: (
        <>
          <KeyIcon theme={theme} large>
            {KEY_OPTION}
          </KeyIcon>
          <Plus color={fgDim} />
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
            {KEY_SHIFT}
          </KeyIcon>
          <Plus color={fgDim} />
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
        <div
          key={i}
          style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 6 }}
        >
          <span style={{ display: "inline-flex", alignItems: "center" }}>{it.keys}</span>
          <span style={{ font: "400 11px/1 Inter, sans-serif", color: fgDim }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
