"use client";
import { useEffect, useState } from "react";
// Re-read account state on return to a retained page or after a history reset.
export function useWatchRefresh(userId) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!userId) return;
    const refresh = () => setRevision((value) => value + 1);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const onPageShow = (event) => { if (event.persisted) refresh(); };
    const onChanged = (event) => { if (!event.detail?.userId || event.detail.userId === userId) refresh(); };
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("cinext:watch-data-changed", onChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("cinext:watch-data-changed", onChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);
  return revision;
}
