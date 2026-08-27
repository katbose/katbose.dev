import { ContactSchema, FaviconSetSchema, ProfileImageSchema } from "@katbose/shared";
import { describe, expect, it } from "vitest";

const key = "123e4567-e89b-42d3-a456-426614174000/portrait.webp";
describe("shared schemas", () => {
  it("accepts valid contacts and rejects honeypots", () => {
    const valid = {
      name: "Test",
      email: "test@example.com",
      message: "A useful message.",
      website: "",
      turnstileToken: "token",
    };
    expect(ContactSchema.parse(valid).name).toBe("Test");
    expect(() => ContactSchema.parse({ ...valid, website: "spam" })).toThrow();
  });
  it("requires immutable profile keys and meaningful alt text", () => {
    expect(
      ProfileImageSchema.parse({
        key,
        alt: "Portrait of Kat Bose",
        width: 960,
        height: 960,
        mimeType: "image/webp",
      }).key,
    ).toBe(key);
    expect(() =>
      ProfileImageSchema.parse({
        key: "portrait.webp",
        alt: "x",
        width: 1,
        height: 1,
        mimeType: "image/svg+xml",
      }),
    ).toThrow();
  });
  it("requires all five PNG favicon variants", () => {
    const widths = [32, 48, 180, 192, 512] as const;
    const variants = widths.map((width) => ({
      key: key.replace("portrait.webp", `${width}.png`),
      width,
      height: width,
      mimeType: "image/png" as const,
    }));
    expect(FaviconSetSchema.parse({ sourceKey: key, variants }).variants).toHaveLength(5);
  });
});
