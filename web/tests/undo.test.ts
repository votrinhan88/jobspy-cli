import { describe, expect, it } from "vitest";
import { undoPatchBody } from "@/lib/undo";

describe("undo", () => {
  it("builds a PATCH body that restores the previous status and timestamp", () => {
    expect(
      undoPatchBody({ status: "applied", status_updated_at: "2026-09-12T08:30:00.000Z" })
    ).toEqual({ status: "applied", status_updated_at: "2026-09-12T08:30:00.000Z" });
  });

  it("restores the empty status and an empty timestamp for a job that was new", () => {
    expect(undoPatchBody({ status: "", status_updated_at: "" })).toEqual({
      status: "",
      status_updated_at: "",
    });
    expect(undoPatchBody({ status: "", status_updated_at: undefined })).toEqual({
      status: "",
      status_updated_at: "",
    });
  });
});
