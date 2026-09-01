import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  // `tsconfig.base.json` sets `jsx: "preserve"` because Next owns the app build,
  // which leaves the test transform unable to parse a `.tsx` import. Tests that
  // server-render a component need that transform, so it is configured here
  // rather than weakening the compiler options the framework depends on.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next", ".open-next"],
  },
});
