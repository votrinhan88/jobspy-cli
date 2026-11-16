import { useEffect, useRef } from "react";

export function useDismiss(active: boolean, insideSelector: string, onDismiss: () => void) {
  const latest = useRef(onDismiss);
  useEffect(() => {
    latest.current = onDismiss;
  });

  useEffect(() => {
    if (!active) return;
    function onMouseDown(event: MouseEvent) {
      if (!(event.target as Element).closest(insideSelector)) latest.current();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") latest.current();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [active, insideSelector]);
}
