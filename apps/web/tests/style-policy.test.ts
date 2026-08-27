import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const target = join(path, name);
    if (statSync(target).isDirectory()) return sourceFiles(target);
    return /\.(css|ts|tsx)$/.test(name) ? [target] : [];
  });
}
const roots = ["app", "components", "features", "lib"].flatMap(sourceFiles);
describe("design-system source policy", () => {
  it("keeps raw colors inside theme.css only", () => {
    const violations = roots.filter(
      (file) =>
        !file.endsWith("theme.css") && /#[0-9a-f]{3,8}\b|rgba?\(/i.test(readFileSync(file, "utf8")),
    );
    expect(violations).toEqual([]);
  });
  it("keeps spacing declarations tokenized", () => {
    const violations = roots.filter(
      (file) =>
        file.endsWith(".css") &&
        !file.endsWith("theme.css") &&
        /(?:margin|padding|gap|top|right|bottom|left):\s*\d+(?:px|rem)/i.test(
          readFileSync(file, "utf8"),
        ),
    );
    expect(violations).toEqual([]);
  });
});
