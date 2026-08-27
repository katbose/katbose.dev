import { SITE_IDENTITY } from "@katbose/shared";
import { PHASE_ONE_FALLBACK_CONTENT } from "./fallback-content";
import { PUBLIC_ROUTES } from "./routes";

export function getIndexableRoutes({ includeAgent = true } = {}) {
  return PUBLIC_ROUTES.filter(
    (route) => route.indexable && (includeAgent || route.path !== "/agent"),
  );
}

const nonIndexablePaths = PUBLIC_ROUTES.filter((route) => !route.indexable).map(
  (route) => route.path,
);

export const ROBOTS_RULES = [
  { userAgent: "*", allow: "/", disallow: ["/api/", ...nonIndexablePaths] },
  { userAgent: "GPTBot", allow: "/" },
  { userAgent: "ClaudeBot", allow: "/" },
  { userAgent: "PerplexityBot", allow: "/" },
] as const;

export function generateAgentMarkdown() {
  const content = PHASE_ONE_FALLBACK_CONTENT;
  return [
    `# ${SITE_IDENTITY.name}`,
    "",
    `> ${SITE_IDENTITY.role}. Public portfolio content for agents and assistive workflows.`,
    "",
    "## Profile",
    content.hero.intro,
    "",
    "## Experience",
    ...content.experience.map((item) => `- ${item}`),
    "",
    "## Technology stack",
    ...content.skills.map((item) => `- ${item.name}`),
    "",
    "## About",
    content.story,
    "",
    "## Featured project",
    ...content.projects.map((item) => `- ${item}`),
    "",
    "## Latest writing",
    ...content.blog.map((item) => `- ${item}`),
    "",
    "## Things I Explore",
    ...content.tie.map((item) => `- ${item}`),
    "",
    "## Education",
    ...content.education.map((item) => `- ${item}`),
    "",
    "## Public routes",
    ...getIndexableRoutes({ includeAgent: false }).map(
      (route) => `- [${route.label}](${SITE_IDENTITY.siteUrl}${route.path}): ${route.description}`,
    ),
    "",
    "## Contact",
    `- Email: ${SITE_IDENTITY.email}`,
    `- GitHub: ${SITE_IDENTITY.githubUrl}`,
    `- LinkedIn: ${SITE_IDENTITY.linkedInUrl}`,
    "",
  ].join("\n");
}

export function generateLlmsText() {
  return [
    `# ${SITE_IDENTITY.name} — katbose.dev`,
    "",
    "> Generated from the typed public route manifest.",
    "",
    "## Pages",
    ...getIndexableRoutes().map(
      (route) => `- [${route.label}](${SITE_IDENTITY.siteUrl}${route.path}): ${route.description}`,
    ),
    "",
    "## Contact",
    `- Email: ${SITE_IDENTITY.email}`,
    `- LinkedIn: ${SITE_IDENTITY.linkedInUrl}`,
    `- GitHub: ${SITE_IDENTITY.githubUrl}`,
    "",
  ].join("\n");
}

export function generateRobotsText() {
  const blocks = ROBOTS_RULES.map((rule) => {
    const disallowed = "disallow" in rule ? rule.disallow : [];
    return [
      `User-Agent: ${rule.userAgent}`,
      `Allow: ${rule.allow}`,
      ...disallowed.map((path: string) => `Disallow: ${path}`),
    ].join("\n");
  });
  return [...blocks, `Sitemap: ${SITE_IDENTITY.siteUrl}/sitemap.xml`].join("\n\n") + "\n";
}

export function generateHumansText() {
  return [
    `/* TEAM */`,
    `Developer: ${SITE_IDENTITY.name}`,
    `Contact: ${SITE_IDENTITY.email}`,
    `LinkedIn: ${SITE_IDENTITY.linkedInUrl}`,
    `GitHub: ${SITE_IDENTITY.githubUrl}`,
    `Site: ${SITE_IDENTITY.siteUrl}`,
    `Location: ${SITE_IDENTITY.location}`,
    "",
    `/* SITE */`,
    `Standards: HTML5, CSS3, TypeScript`,
    `Components: Next.js, Tailwind CSS, Base UI, Payload CMS, Supabase, Cloudflare`,
    "",
  ].join("\n");
}
