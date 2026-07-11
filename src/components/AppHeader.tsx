import { InlineTweaks } from "./panels/InlineTweaks";
import type { SetTweak, Tweaks } from "../useTweaks";

// Top bar: logo, theme/viz toggles, and the hidden file input that backs the
// Import button (it must stay mounted while the score panel triggers it).
export function AppHeader({
  t,
  setTweak,
  fg,
  border,
  surface,
  fileInputRef,
  onImportFile,
}: {
  t: Tweaks;
  setTweak: SetTweak;
  fg: string;
  border: string;
  surface: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0 18px",
        borderBottom: `1px solid ${border}`,
        background: surface,
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 22,
            height: 22,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr 1fr",
            gap: 2,
          }}
        >
          <div style={{ background: "oklch(0.78 0.12 195)", borderRadius: 1.5 }}></div>
          <div style={{ background: "oklch(0.82 0.10 240)", borderRadius: 1.5 }}></div>
          <div style={{ background: "oklch(0.86 0.16 110)", borderRadius: 1.5 }}></div>
          <div style={{ background: "oklch(0.78 0.13 25)", borderRadius: 1.5 }}></div>
        </div>
        <div className="logo" style={{ color: fg }}>
          <span className="l-name">Smart Storage</span>
        </div>
      </div>

      <div style={{ flex: 1 }}></div>

      <InlineTweaks t={t} setTweak={setTweak} theme={t.theme} />

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={onImportFile}
        style={{ display: "none" }}
      />
    </header>
  );
}
