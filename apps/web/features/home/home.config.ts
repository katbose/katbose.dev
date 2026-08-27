import { HomeSectionSchema } from "./sections";

export const HOME_SECTIONS = HomeSectionSchema.array().parse([
  { id: "hero", enabled: true, type: "hero", source: "profile" },
  { id: "experience", enabled: true, type: "experience", source: "experience" },
  { id: "tech", enabled: true, type: "techStack", source: "profile.skills" },
  { id: "story", enabled: true, type: "story", source: "profile.story" },
  { id: "project", enabled: true, type: "projectSpotlight", source: "projects", limit: 1 },
  { id: "thinking", enabled: true, type: "thinking", source: "blog", limit: 3 },
  { id: "notes", enabled: true, type: "notes", source: "tie", limit: 3 },
  { id: "education", enabled: true, type: "education", source: "profile.education" },
  { id: "contact", enabled: true, type: "contact", source: "profile.contact" },
]);
