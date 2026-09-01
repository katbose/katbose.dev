import { describe, expect, it } from "vitest";
import { constantTimeEquals } from "@/lib/security/constant-time";

const SECRET = "test-fixture-value-not-a-real-secret";

describe("constantTimeEquals", () => {
  it("accepts only a byte-identical value", () => {
    expect(constantTimeEquals(SECRET, SECRET)).toBe(true);
    expect(constantTimeEquals("", "")).toBe(true);
  });

  it("rejects a value that differs at any single position", () => {
    for (let index = 0; index < SECRET.length; index += 1) {
      const mutated = `${SECRET.slice(0, index)}x${SECRET.slice(index + 1)}`;
      if (mutated === SECRET) continue;
      expect(constantTimeEquals(SECRET, mutated)).toBe(false);
    }
  });

  it("rejects a length mismatch without throwing", () => {
    for (const provided of ["", SECRET.slice(0, -1), `${SECRET}x`, `${SECRET}${SECRET}`]) {
      expect(() => constantTimeEquals(SECRET, provided)).not.toThrow();
      expect(constantTimeEquals(SECRET, provided)).toBe(false);
    }
  });

  it("is symmetric", () => {
    for (const [left, right] of [
      [SECRET, SECRET],
      [SECRET, "different"],
      ["", SECRET],
      ["ünïcode", "ünïcode"],
    ] as const) {
      expect(constantTimeEquals(left, right)).toBe(constantTimeEquals(right, left));
    }
  });

  it("compares by bytes, so distinct multi-byte strings never collide", () => {
    expect(constantTimeEquals("é", "é")).toBe(true);
    // Same visual length, different UTF-8 byte length.
    expect(constantTimeEquals("é", "e")).toBe(false);
    expect(constantTimeEquals("🔐", "🔐")).toBe(true);
    expect(constantTimeEquals("🔐", "🔓")).toBe(false);
  });
});
