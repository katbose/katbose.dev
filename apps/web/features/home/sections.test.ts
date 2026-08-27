import { describe, expect, it } from "vitest";
import { HOME_SECTIONS } from "./home.config";
import { HomeSectionSchema } from "./sections";

describe("Home section manifest", () => {
  it("is closed, ordered, and fully enabled for Phase 1", () => {
    expect(HomeSectionSchema.array().parse(HOME_SECTIONS)).toHaveLength(9);
    expect(HOME_SECTIONS.every((section) => section.enabled)).toBe(true);
    expect(HOME_SECTIONS.map((section) => section.id)).toEqual([
      "hero",
      "experience",
      "tech",
      "story",
      "project",
      "thinking",
      "notes",
      "education",
      "contact",
    ]);
  });
  it("rejects unknown section variants", () => {
    expect(() =>
      HomeSectionSchema.parse({ id: "bad", enabled: true, type: "copied", source: "upstream" }),
    ).toThrow();
  });
});
