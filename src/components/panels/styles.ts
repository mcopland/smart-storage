import type { CSSProperties } from "react";

export const ACCENT = "oklch(0.78 0.12 195)";
export const DANGER = "oklch(0.7 0.18 25)";

export function btnStyle(
  theme: string,
  kind: "primary" | "ghost" | "danger",
  disabled?: boolean,
): CSSProperties {
  const isWarm = theme === "warm";
  if (kind === "danger") {
    return {
      padding: "8px 12px",
      background: disabled ? (isWarm ? "rgba(60,50,40,0.08)" : "rgba(255,255,255,0.05)") : DANGER,
      color: disabled ? (isWarm ? "rgba(60,50,40,0.4)" : "rgba(255,255,255,0.3)") : "#fff",
      border: "none",
      borderRadius: 6,
      font: "500 12px/1 Inter, sans-serif",
      letterSpacing: "0.02em",
      cursor: disabled ? "not-allowed" : "pointer",
    };
  }
  if (kind === "primary") {
    return {
      padding: "8px 12px",
      background: disabled ? (isWarm ? "rgba(60,50,40,0.08)" : "rgba(255,255,255,0.05)") : ACCENT,
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
