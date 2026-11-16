import { useEffect, useRef, useState } from "react";
import type { ScrapeConfig } from "@/lib/config";

export type SaveState = "saved" | "unsaved" | "saving" | "error";

export const SAVE_TEXT: Record<SaveState, string> = {
  saved: "All changes saved",
  unsaved: "Unsaved changes",
  saving: "Saving changes…",
  error: "Could not save changes.",
};

export function useScrapeConfig() {
  const [config, setConfig] = useState<ScrapeConfig | null>(null);
  const [noProfile, setNoProfile] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configRef = useRef<ScrapeConfig | null>(null);

  useEffect(() => {
    fetch("/api/scrape/config").then(async (res) => {
      if (res.status === 400) setNoProfile(true);
      else if (res.ok) setConfig(await res.json());
    });
  }, []);

  async function save(cfg: ScrapeConfig) {
    setSaveState("saving");
    try {
      const res = await fetch("/api/scrape/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      setSaveState(res.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }

  function update(patch: Partial<ScrapeConfig>) {
    if (!config) return;
    const next = { ...config, ...patch };
    setConfig(next);
    setSaveState("unsaved");
    configRef.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(next), 800);
  }

  function flush() {
    if (!configRef.current) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    save(configRef.current);
  }

  return { config, noProfile, saveState, update, flush };
}
