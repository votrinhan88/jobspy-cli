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
          environment: "jsdom",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
          globals: true,
        },
      },
    ],
  },
});
