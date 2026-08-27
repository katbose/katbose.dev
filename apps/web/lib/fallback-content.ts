import {
  siCloudflare,
  siNextdotjs,
  siPostgresql,
  siReact,
  siSupabase,
  siTypescript,
} from "simple-icons";
import { z } from "zod";

const PhaseOneFallbackContentSchema = z.object({
  hero: z.object({ pronunciation: z.string().min(1), intro: z.string().min(1) }),
  experience: z.array(z.string().min(1)).min(1),
  skills: z.array(z.object({ name: z.string().min(1), path: z.string().min(1) })).min(1),
  story: z.string().min(1),
  projects: z.array(z.string().min(1)).min(1),
  blog: z.array(z.string().min(1)).min(1),
  tie: z.array(z.string().min(1)).min(1),
  education: z.array(z.string().min(1)).min(1),
});

export const PHASE_ONE_FALLBACK_CONTENT = PhaseOneFallbackContentSchema.parse({
  hero: {
    pronunciation: "/kæt boʊs/ • software engineer",
    intro: "I design dependable web systems that stay fast, accessible, and easy to understand.",
  },
  experience: [
    "Product-minded engineering",
    "Secure server-side integrations",
    "Accessible interface systems",
  ],
  skills: [
    { name: "TypeScript", path: siTypescript.path },
    { name: "React", path: siReact.path },
    { name: "Next.js", path: siNextdotjs.path },
    { name: "Cloudflare", path: siCloudflare.path },
    { name: "Postgres", path: siPostgresql.path },
    { name: "Supabase", path: siSupabase.path },
  ],
  story:
    "I care about the boundaries between a thoughtful interface and the systems that keep it trustworthy.",
  projects: ["katbose.dev — an agent-readable portfolio on Cloudflare Workers"],
  blog: ["Architecture notes are being prepared for publication."],
  tie: ["TIE means Things I Explore: concise engineering notes without long-form ceremony."],
  education: ["Continuous learning through building, writing, and reviewing production systems."],
});

export type TechnologyItem = (typeof PHASE_ONE_FALLBACK_CONTENT.skills)[number];
