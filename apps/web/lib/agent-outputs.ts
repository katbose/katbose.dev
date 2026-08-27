import { SITE_IDENTITY } from "@katbose/shared";
import { PHASE_ONE_FALLBACK_CONTENT } from "./fallback-content";
import { PUBLIC_ROUTES } from "./routes";
import { SITE_URL } from "./site-url";

export function getIndexableRoutes({ includeAgent = true } = {}) {
  return PUBLIC_ROUTES.filter(
    (route) => route.indexable && (includeAgent || route.path !== "/agent"),
  );
}

const nonIndexablePaths = PUBLIC_ROUTES.filter((route) => !route.indexable).map(
  (route) => route.path,
);

// Stated here rather than left to Cloudflare's managed robots.txt, which used to
// inject this signal alongside `Disallow: /` for GPTBot and ClaudeBot — the exact
// crawlers this site allows on purpose. Owning the directive keeps the training
// preference without the contradiction. See docs/16-decision-log.md.
export const CONTENT_SIGNAL = "search=yes, ai-train=no, use=reference";

// Training-only crawlers that get no benefit to a reader of this site. Carried
// over from Cloudflare's managed robots.txt so that turning that feature off —
// it also emitted `Disallow: /` for the assistants below, which this site allows
// on purpose — does not quietly drop the opt-out. Kept as a plain list because
// the tokens are vendor-defined, not routes.
export const TRAINING_OPT_OUT_AGENTS = [
  "Amazonbot",
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
  "Google-Extended",
  "meta-externalagent",
] as const;

export const ROBOTS_RULES = [
  {
    userAgent: "*",
    contentSignal: CONTENT_SIGNAL,
    allow: "/",
    disallow: ["/api/", ...nonIndexablePaths],
  },
  // Assistants that make the site more useful when they can read it: this is the
  // whole point of /agent and /llms.txt.
  { userAgent: "GPTBot", allow: "/" },
  { userAgent: "ClaudeBot", allow: "/" },
  { userAgent: "PerplexityBot", allow: "/" },
  ...TRAINING_OPT_OUT_AGENTS.map((userAgent) => ({ userAgent, disallow: ["/"] as const })),
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
      (route) => `- [${route.label}](${SITE_URL}${route.path}): ${route.description}`,
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
    `# ${SITE_IDENTITY.name} — ${new URL(SITE_URL).host}`,
    "",
    "> Generated from the typed public route manifest.",
    "",
    "## Pages",
    ...getIndexableRoutes().map(
      (route) => `- [${route.label}](${SITE_URL}${route.path}): ${route.description}`,
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
      ...("contentSignal" in rule ? [`Content-Signal: ${rule.contentSignal}`] : []),
      // Opt-out groups carry only Disallow, so an unconditional `Allow:` here
      // would emit an empty directive and contradict the block.
      ...("allow" in rule ? [`Allow: ${rule.allow}`] : []),
      ...disallowed.map((path: string) => `Disallow: ${path}`),
    ].join("\n");
  });
  return [...blocks, `Sitemap: ${SITE_URL}/sitemap.xml`].join("\n\n") + "\n";
}

export function generateHumansText() {
  return [
    `/* TEAM */`,
    `Developer: ${SITE_IDENTITY.name}`,
    `Contact: ${SITE_IDENTITY.email}`,
    `LinkedIn: ${SITE_IDENTITY.linkedInUrl}`,
    `GitHub: ${SITE_IDENTITY.githubUrl}`,
    `Site: ${SITE_URL}`,
    `Location: ${SITE_IDENTITY.location}`,
    "",
    `/* SITE */`,
    `Standards: HTML5, CSS3, TypeScript`,
    `Components: Next.js, Tailwind CSS, Base UI, Payload CMS, Supabase, Cloudflare`,
    "",
  ].join("\n");
}
