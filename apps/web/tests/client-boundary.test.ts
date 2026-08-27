import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const target = join(path, name);
    if (statSync(target).isDirectory()) return files(target);
    return /\.(ts|tsx)$/.test(name) ? [target] : [];
  });
}
describe("client security boundary", () => {
  it("keeps Supabase and server secrets out of Client Components", () => {
    const forbidden =
      /@supabase\/supabase-js|SUPABASE_SERVICE_ROLE_KEY|PREVIEW_URL_SECRET|PREVIEW_INTERNAL_SECRET/;
    const violations = ["app", "components", "features"].flatMap(files).filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.startsWith('"use client"') && forbidden.test(source);
    });
    expect(violations).toEqual([]);
  });
});
