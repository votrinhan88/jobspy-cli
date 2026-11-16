import path from "path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(__dirname) };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "dom",
          pool: "vmThreads",
          environment: "happy-dom",
          environmentOptions: { happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: true } } },
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
          globals: true,
        },
      },
    ],
  },
});
