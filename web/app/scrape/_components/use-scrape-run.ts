import { useCallback, useEffect, useRef, useState } from "react";
import type { ScrapeStatus } from "@/lib/scrape-status";

function emptyStatus(): ScrapeStatus {
  return {
    status: "idle",
    started_at: null,
    finished_at: null,
    new_jobs: null,
    total_jobs: null,
    error: null,
    pid: null,
    source_runs: [],
  };
}

export function useScrapeRun() {
  const [status, setStatus] = useState<ScrapeStatus | null>(null);
  const [noProfile, setNoProfile] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [log, setLog] = useState("");
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const logPollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLog = useCallback(async () => {
    const res = await fetch("/api/scrape/log");
    if (res.ok) setLog(await res.text());
  }, []);

  const stopLogPolling = useCallback(() => {
    if (logPollTimer.current) {
      clearInterval(logPollTimer.current);
      logPollTimer.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollTimer.current) return;
    pollTimer.current = setInterval(async () => {
      const res = await fetch("/api/scrape/status");
      if (!res.ok) return;
      const st: ScrapeStatus = await res.json();
      setStatus(st);
      if (st.status !== "running") {
        clearInterval(pollTimer.current!);
        pollTimer.current = null;
        stopLogPolling();
        setRunning(false);
        fetchLog();
      }
    }, 5000);

    if (logPollTimer.current) return;
    logPollTimer.current = setInterval(fetchLog, 1000);
  }, [fetchLog, stopLogPolling]);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/scrape/status");
      if (res.status === 400) {
        setNoProfile(true);
        return;
      }
      if (res.ok) {
        const st: ScrapeStatus = await res.json();
        setStatus(st);
        if (st.status === "running") startPolling();
      }
      fetchLog();
    }

    load();
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (logPollTimer.current) clearInterval(logPollTimer.current);
    };
  }, [fetchLog, startPolling]);

  async function run() {
    setRunError(null);
    setRunning(true);
    const res = await fetch("/api/scrape/run", { method: "POST" });
    if (!res.ok) {
      const data = await res.json();
      setRunError(data.error ?? "Failed to start scrape");
      setRunning(false);
      return;
    }
    setStatus((s) => ({
      ...(s ?? emptyStatus()),
      status: "running",
      started_at: new Date().toISOString(),
    }));
    startPolling();
  }

  return {
    status,
    log,
    runError,
    noProfile,
    isRunning: running || status?.status === "running",
    run,
  };
}
