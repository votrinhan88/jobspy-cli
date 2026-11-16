export interface SchedulePreset {
  label: string;
  value: string | null;
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  { label: "Off", value: null },
  { label: "Daily 8 AM (server time)", value: "0 8 * * *" },
  { label: "Daily midnight (server time)", value: "0 0 * * *" },
  { label: "Monday 8 AM (server time)", value: "0 8 * * 1" },
];

export function presetLabelFor(expr: string | null): string {
  return SCHEDULE_PRESETS.find((p) => p.value === expr)?.label ?? "Custom";
}
