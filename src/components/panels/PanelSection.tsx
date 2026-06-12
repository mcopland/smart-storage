import type { ReactNode } from "react";

// Reusable Section (MUST be defined outside components to prevent remount)
export function PanelSection({
  label,
  children,
  theme,
}: {
  label: string;
  children: ReactNode;
  theme: string;
}) {
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
