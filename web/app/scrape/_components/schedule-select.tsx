"use client";

import { useState } from "react";
import { SCHEDULE_PRESETS, presetLabelFor } from "@/lib/schedule-presets";

const CUSTOM_LABEL = "Custom";

export function ScheduleSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [mode, setMode] = useState(presetLabelFor(value));
  const [expression, setExpression] = useState(value ?? "");

  function handleSelect(label: string) {
    setMode(label);
    if (label === CUSTOM_LABEL) {
      setExpression("");
      return;
    }
    const preset = SCHEDULE_PRESETS.find((p) => p.label === label);
    if (preset) onChange(preset.value);
  }

  function handleExpression(text: string) {
    setExpression(text);
    onChange(text);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          aria-label="Schedule"
          className="input input--sm"
          value={mode}
          onChange={(e) => handleSelect(e.target.value)}
        >
          {SCHEDULE_PRESETS.map((preset) => (
            <option key={preset.label} value={preset.label}>
              {preset.label}
            </option>
          ))}
          <option value={CUSTOM_LABEL}>{CUSTOM_LABEL}</option>
        </select>
        {mode === CUSTOM_LABEL && (
          <input
            aria-label="Cron expression"
            className="input input--sm"
            placeholder="*/15 * * * *"
            value={expression}
            onChange={(e) => handleExpression(e.target.value)}
          />
        )}
      </div>
      <p className="hint">Times use server time.</p>
      <p className="hint">Schedules run only while the server is running.</p>
    </>
  );
}
