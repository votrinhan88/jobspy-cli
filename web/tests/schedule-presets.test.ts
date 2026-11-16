import { describe, it, expect } from "vitest";
import { SCHEDULE_PRESETS, presetLabelFor } from "@/lib/schedule-presets";

describe("SCHEDULE_PRESETS", () => {
  it("lists Off first with a null value", () => {
    expect(SCHEDULE_PRESETS[0]).toEqual({ label: "Off", value: null });
  });

  it("includes the daily 8 AM, daily midnight and Monday presets", () => {
    const values = SCHEDULE_PRESETS.map((p) => p.value);
    expect(values).toContain("0 8 * * *");
    expect(values).toContain("0 0 * * *");
    expect(values).toContain("0 8 * * 1");
  });
});

describe("presetLabelFor", () => {
  it("returns Off for null", () => {
    expect(presetLabelFor(null)).toBe("Off");
  });

  it("returns the preset label for a preset expression", () => {
    expect(presetLabelFor("0 8 * * *")).toBe("Daily 8 AM (server time)");
  });

  it("returns Custom for any other expression", () => {
    expect(presetLabelFor("*/15 * * * *")).toBe("Custom");
  });
});
