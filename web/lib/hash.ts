import { createHash } from "crypto";

export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}
