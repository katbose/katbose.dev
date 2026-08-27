import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../app/theme.css", import.meta.url), "utf8");
const hex = Object.fromEntries(
  [...css.matchAll(/--(gray-\d+):\s*(#[0-9a-f]{6})/gi)].map((match) => [match[1], match[2]]),
);
function luminance(color: string) {
  const channels = [1, 3, 5]
    .map((index) => Number.parseInt(color.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}
function contrast(first: string, second: string) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

describe("design-token contrast", () => {
  it.each([
    ["gray-1000", "gray-0", 4.5],
    ["gray-600", "gray-0", 4.5],
    ["gray-500", "gray-0", 4.5],
    ["gray-0", "gray-1000", 4.5],
    ["gray-300", "gray-1000", 4.5],
    ["gray-400", "gray-1000", 4.5],
    ["gray-500", "gray-0", 3],
    ["gray-500", "gray-1000", 3],
  ])("%s on %s meets %s:1", (foreground, background, minimum) => {
    expect(contrast(hex[foreground]!, hex[background]!)).toBeGreaterThanOrEqual(minimum);
  });
});
