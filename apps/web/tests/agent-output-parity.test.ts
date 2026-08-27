import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateAgentMarkdown, generateLlmsText, generateRobotsText } from "@/lib/agent-outputs";

function normalize(value: string) {
  return value.replaceAll("\r\n", "\n");
}
describe("repository agent exports", () => {
  it("matches the canonical generators", () => {
    expect(normalize(readFileSync(new URL("../../../llms.txt", import.meta.url), "utf8"))).toBe(
      generateLlmsText(),
    );
    expect(normalize(readFileSync(new URL("../../../robots.txt", import.meta.url), "utf8"))).toBe(
      generateRobotsText(),
    );
  });

  it("renders every Phase 1 portfolio section in the canonical agent view", () => {
    const markdown = generateAgentMarkdown();
    for (const heading of [
      "## Profile",
      "## Experience",
      "## Technology stack",
      "## About",
      "## Featured project",
      "## Latest writing",
      "## Things I Explore",
      "## Education",
      "## Public routes",
      "## Contact",
    ]) {
      expect(markdown).toContain(heading);
    }
  });
});
