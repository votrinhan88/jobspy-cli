import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(__dirname, "../app/styles");

export const allCss = [
  readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8"),
  ...readdirSync(dir)
    .filter((name) => name.endsWith(".css"))
    .map((name) => readFileSync(path.join(dir, name), "utf8")),
]
  .join("\n")
  .replace(/\r\n/g, "\n");
