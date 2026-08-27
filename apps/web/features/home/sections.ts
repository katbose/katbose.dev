import { z } from "zod";

const fields = { id: z.string().min(1), enabled: z.boolean() };

export const HomeSectionSchema = z.discriminatedUnion("type", [
  z.object({ ...fields, type: z.literal("hero"), source: z.literal("profile") }),
  z.object({ ...fields, type: z.literal("experience"), source: z.literal("experience") }),
  z.object({ ...fields, type: z.literal("techStack"), source: z.literal("profile.skills") }),
  z.object({ ...fields, type: z.literal("story"), source: z.literal("profile.story") }),
  z.object({
    ...fields,
    type: z.literal("projectSpotlight"),
    source: z.literal("projects"),
    limit: z.literal(1),
  }),
  z.object({
    ...fields,
    type: z.literal("thinking"),
    source: z.literal("blog"),
    limit: z.number().int().min(1).max(6),
  }),
  z.object({
    ...fields,
    type: z.literal("notes"),
    source: z.literal("tie"),
    limit: z.number().int().min(1).max(6),
  }),
  z.object({ ...fields, type: z.literal("education"), source: z.literal("profile.education") }),
  z.object({ ...fields, type: z.literal("contact"), source: z.literal("profile.contact") }),
]);

export type HomeSection = z.infer<typeof HomeSectionSchema>;

export function assertNever(value: never): never {
  throw new Error(`Unregistered section: ${JSON.stringify(value)}`);
}
