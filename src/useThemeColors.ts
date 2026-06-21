export interface ThemeColors {
  fg: string;
  fgFaint: string;
  bg: string;
  surface: string;
  surfaceSubtle: string;
  border: string;
}

export function useThemeColors(theme: string): ThemeColors {
  const isWarm = theme === "warm";
  return {
    fg: isWarm ? "#3a2f22" : "rgba(255,255,255,0.92)",
    fgFaint: isWarm ? "rgba(60,50,40,0.35)" : "rgba(255,255,255,0.3)",
    bg: isWarm ? "#f5f1e8" : "#0e1116",
    surface: isWarm ? "#fbf8f0" : "#141a23",
    surfaceSubtle: isWarm ? "#f0ebde" : "#0d121a",
    border: isWarm ? "rgba(60,50,40,0.1)" : "rgba(255,255,255,0.06)",
  };
}
