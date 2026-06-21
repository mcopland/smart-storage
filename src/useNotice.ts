import { useCallback, useState } from "react";

export interface NoticeState {
  notice: string | null;
  showNotice: (msg: string) => void;
  dismiss: () => void;
}

export function useNotice(): NoticeState {
  const [notice, setNotice] = useState<string | null>(null);
  const showNotice = useCallback((msg: string) => setNotice(msg), []);
  const dismiss = useCallback(() => setNotice(null), []);
  return { notice, showNotice, dismiss };
}
