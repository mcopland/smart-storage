import { useCallback, useState } from "react";

export interface Tweaks {
  theme: "dark" | "warm";
  vizMode: "focus" | "edges";
  zoom: number;
  iconStyle: "solid" | "glyph";
  trayLayout: "drawer" | "rail";
}

export const TWEAK_DEFAULTS: Tweaks = {
  theme: "dark",
  vizMode: "focus",
  zoom: 100,
  iconStyle: "solid",
  trayLayout: "drawer",
};

export type SetTweak = <K extends keyof Tweaks>(key: K, val: Tweaks[K]) => void;

export function useTweaks(defaults: Tweaks): [Tweaks, SetTweak] {
  const [values, setValues] = useState(defaults);
  const setTweak = useCallback<SetTweak>((key, val) => {
    setValues(prev => ({ ...prev, [key]: val }));
  }, []);
  return [values, setTweak];
}
