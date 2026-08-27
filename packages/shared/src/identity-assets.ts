import { z } from "zod";

const immutableKey = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[a-z0-9._-]+$/i,
    "Identity asset keys must be immutable UUID paths.",
  );

export const ProfileImageSchema = z.object({
  key: immutableKey,
  alt: z.string().trim().min(3).max(200),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
});

const faviconVariant = z.object({
  key: immutableKey,
  width: z.union([z.literal(32), z.literal(48), z.literal(180), z.literal(192), z.literal(512)]),
  height: z.union([z.literal(32), z.literal(48), z.literal(180), z.literal(192), z.literal(512)]),
  mimeType: z.literal("image/png"),
});

export const FaviconSetSchema = z.object({
  sourceKey: immutableKey,
  variants: faviconVariant.array().length(5),
});

export type ProfileImage = z.infer<typeof ProfileImageSchema>;
export type FaviconSet = z.infer<typeof FaviconSetSchema>;
