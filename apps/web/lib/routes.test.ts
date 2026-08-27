import { describe, expect, it } from "vitest";
import { generateHumansText, generateLlmsText, generateRobotsText } from "./agent-outputs";
import { PUBLIC_ROUTES } from "./routes";

describe("public route manifest", () => {
  it("has unique paths and metadata for every route", () => {
    expect(new Set(PUBLIC_ROUTES.map((route) => route.path)).size).toBe(PUBLIC_ROUTES.length);
    expect(PUBLIC_ROUTES.every((route) => route.label && route.description)).toBe(true);
  });
  it("drives every agent-facing output", () => {
    const llms = generateLlmsText();
    for (const route of PUBLIC_ROUTES.filter((entry) => entry.indexable)) {
      expect(llms).toContain(`katbose.dev${route.path}`);
    }
    expect(generateRobotsText()).toContain("Disallow: /api/");
    expect(generateHumansText()).toContain("Developer: KatBose");
  });
});
