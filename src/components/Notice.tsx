import { useThemeColors } from "../useThemeColors";
import { DANGER } from "./panels/styles";

interface NoticeProps {
  notice: string | null;
  theme: string;
  onDismiss: () => void;
}

export function Notice({ notice, theme, onDismiss }: NoticeProps) {
  const { surface, border } = useThemeColors(theme);

  if (!notice) return null;

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 900,
        maxWidth: 420,
        padding: "10px 12px 10px 14px",
        background: surface,
        border: `1px solid ${border}`,
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        font: "12px/1.45 Inter, sans-serif",
        color: DANGER,
      }}
    >
      <span style={{ flex: 1, wordBreak: "break-word" }}>{notice}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notice"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "inherit",
          padding: 0,
          font: "inherit",
          opacity: 0.65,
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        x
      </button>
    </div>
  );
}
