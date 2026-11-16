import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScheduleSelect } from "@/app/scrape/_components/schedule-select";

describe("ScheduleSelect", () => {
  it("shows Off for a null value", () => {
    render(<ScheduleSelect value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Schedule")).toHaveDisplayValue("Off");
  });

  it("shows the preset label for a preset expression", () => {
    render(<ScheduleSelect value="0 8 * * 1" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Schedule")).toHaveDisplayValue("Monday 8 AM (server time)");
  });

  it("calls onChange with the cron string when a preset is picked", async () => {
    const onChange = vi.fn();
    render(<ScheduleSelect value={null} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Schedule"), "Daily 8 AM (server time)");
    expect(onChange).toHaveBeenCalledWith("0 8 * * *");
  });

  it("calls onChange with null when Off is picked", async () => {
    const onChange = vi.fn();
    render(<ScheduleSelect value="0 8 * * *" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Schedule"), "Off");
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("tells the user that schedules use server time and need a running server", () => {
    render(<ScheduleSelect value={null} onChange={vi.fn()} />);
    expect(screen.getByText(/times use server time/i)).toBeInTheDocument();
    expect(screen.getByText(/only while the server is running/i)).toBeInTheDocument();
  });

  it("hides the cron input for presets", () => {
    render(<ScheduleSelect value="0 8 * * *" onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Cron expression")).not.toBeInTheDocument();
  });

  it("shows Custom and the expression for an unknown value", () => {
    render(<ScheduleSelect value="*/15 * * * *" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Schedule")).toHaveDisplayValue("Custom");
    expect(screen.getByLabelText("Cron expression")).toHaveValue("*/15 * * * *");
  });

  it("shows an empty cron input after Custom is picked, without calling onChange", async () => {
    const onChange = vi.fn();
    render(<ScheduleSelect value={null} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Schedule"), "Custom");
    expect(screen.getByLabelText("Cron expression")).toHaveValue("");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("calls onChange when the user types a custom expression", async () => {
    const onChange = vi.fn();
    render(<ScheduleSelect value="*/15 * * * *" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Cron expression"), "0");
    expect(onChange).toHaveBeenLastCalledWith("*/15 * * * *0");
  });
});
