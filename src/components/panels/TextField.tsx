import { useEffect, useRef, useState, type CSSProperties } from "react";

// TextField with local draft state to fix the 1-char input bug.
// The root cause: parent re-renders on every keystroke (due to setItemTypes) which
// remounted the old Section (defined inside ScorePanel). Now Section is external,
// but we also use local draft state for extra safety.
export function TextField({
  value,
  onChange,
  style,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  style?: CSSProperties;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const focusRef = useRef(false);
  useEffect(() => {
    if (!focusRef.current) setDraft(value);
  }, [value]);
  const props = {
    value: draft,
    onFocus: () => {
      focusRef.current = true;
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      onChange(e.target.value);
    },
    onBlur: () => {
      focusRef.current = false;
      setDraft(value);
    },
    style,
  };
  if (multiline) return <textarea {...props} rows={2} />;
  return <input {...props} />;
}
