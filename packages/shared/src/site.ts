export const SITE_IDENTITY = {
  name: "Kat Bose",
  role: "Software Engineer",
  siteUrl: "https://katbose.dev",
  email: "im@katbose.dev",
  location: "India",
  githubUrl: "https://github.com/katbose",
  linkedInUrl: "https://linkedin.com/in/katbose",
  calUrl: "https://cal.com/katbose/meet",
} as const;

export type SiteIdentity = typeof SITE_IDENTITY;
