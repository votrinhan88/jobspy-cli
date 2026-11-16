// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { registerAllSchedules } = vi.hoisted(() => ({ registerAllSchedules: vi.fn() }));
vi.mock("@/lib/scheduler", () => ({ registerAllSchedules }));

import { register } from "@/instrumentation";

const original = process.env.NEXT_RUNTIME;

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  process.env.NEXT_RUNTIME = original;
});

describe("register", () => {
  it("registers saved schedules on the nodejs runtime", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    await register();
    expect(registerAllSchedules).toHaveBeenCalledTimes(1);
  });

  it("does nothing on the edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    await register();
    expect(registerAllSchedules).not.toHaveBeenCalled();
  });
});
