import { z } from "zod";

export const PublicPathSchema = z.enum([
  "/",
  "/projects",
  "/experience",
  "/blog",
  "/tie",
  "/resume",
  "/ask-ai",
  "/contact",
  "/privacy",
  "/resume-unavailable",
  "/agent",
]);

const PublicRouteSchema = z.object({
  path: PublicPathSchema,
  label: z.string().min(1),
  description: z.string().min(1),
  navigation: z.boolean(),
  indexable: z.boolean(),
});

export type PublicPath = z.infer<typeof PublicPathSchema>;
export type PublicRoute = z.infer<typeof PublicRouteSchema>;

export const PUBLIC_ROUTES = PublicRouteSchema.array().parse([
  {
    path: "/",
    label: "Home",
    description: "Kat Bose's portfolio and engineering work.",
    navigation: true,
    indexable: true,
  },
  {
    path: "/projects",
    label: "Projects",
    description: "Selected software projects and engineering decisions.",
    navigation: true,
    indexable: true,
  },
  {
    path: "/experience",
    label: "Experience",
    description: "Professional experience and areas of impact.",
    navigation: true,
    indexable: true,
  },
  {
    path: "/blog",
    label: "Blog",
    description: "Long-form technical writing.",
    navigation: true,
    indexable: true,
  },
  {
    path: "/tie",
    label: "TIE",
    description: "Short notes on things I explore.",
    navigation: true,
    indexable: true,
  },
  {
    path: "/resume",
    label: "Resume",
    description: "Recruiter-first resume overview and download entry point.",
    navigation: true,
    indexable: true,
  },
  {
    path: "/ask-ai",
    label: "Ask AI",
    description: "Resilient semantic search over public portfolio content.",
    navigation: true,
    indexable: true,
  },
  {
    path: "/contact",
    label: "Contact",
    description: "Send Kat a message or book a conversation.",
    navigation: true,
    indexable: true,
  },
  {
    path: "/privacy",
    label: "Privacy",
    description: "Plain-language data and privacy policy.",
    navigation: false,
    indexable: true,
  },
  {
    path: "/resume-unavailable",
    label: "Resume unavailable",
    description: "Graceful resume-download fallback.",
    navigation: false,
    indexable: false,
  },
  {
    path: "/agent",
    label: "Agent view",
    description: "Canonical agent-readable portfolio view.",
    navigation: false,
    indexable: true,
  },
]);

export function getRoute(path: PublicPath): PublicRoute {
  const route = PUBLIC_ROUTES.find((candidate) => candidate.path === path);
  if (!route) throw new Error(`Missing public route metadata: ${path}`);
  return route;
}
