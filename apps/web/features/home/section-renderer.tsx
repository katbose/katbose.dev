import { SITE_IDENTITY } from "@katbose/shared";
import Link from "next/link";
import { LocalClock } from "@/components/common/local-clock";
import { ProfilePortrait } from "@/components/common/profile-portrait";
import { Reveal } from "@/components/common/reveal";
import { PHASE_ONE_FALLBACK_CONTENT } from "@/lib/fallback-content";
import { PUBLIC_ROUTES } from "@/lib/routes";
import {
  ExperiencePreview,
  ProjectStat,
  StoryPreview,
  TechStackPreview,
} from "./interactive-sections";
import { assertNever, type HomeSection } from "./sections";

function Section({
  id,
  title,
  children,
}: Readonly<{ id: string; title: string; children: React.ReactNode }>) {
  return (
    <Reveal>
      <section className="home-section" id={id}>
        <h2>{title}</h2>
        {children}
      </section>
    </Reveal>
  );
}

export function SectionRenderer({ section }: Readonly<{ section: HomeSection }>) {
  switch (section.type) {
    case "hero":
      return (
        <Reveal>
          <section className="hero" id={section.id}>
            <ProfilePortrait />
            <div>
              <p className="pronunciation">{PHASE_ONE_FALLBACK_CONTENT.hero.pronunciation}</p>
              <h1>{SITE_IDENTITY.name}</h1>
              <p className="hero-intro">{PHASE_ONE_FALLBACK_CONTENT.hero.intro}</p>
              <LocalClock />
            </div>
          </section>
        </Reveal>
      );
    case "experience":
      return (
        <Section id={section.id} title="Experience">
          <ExperiencePreview items={PHASE_ONE_FALLBACK_CONTENT.experience} />
          <Link href="/experience">View experience</Link>
        </Section>
      );
    case "techStack":
      return (
        <Section id={section.id} title="Tech stack">
          <TechStackPreview items={PHASE_ONE_FALLBACK_CONTENT.skills} />
        </Section>
      );
    case "story":
      return (
        <Section id={section.id} title="About">
          <StoryPreview text={PHASE_ONE_FALLBACK_CONTENT.story} />
        </Section>
      );
    case "projectSpotlight":
      return (
        <Section id={section.id} title="Featured project">
          <p>{PHASE_ONE_FALLBACK_CONTENT.projects[0]}</p>
          <ProjectStat value={PUBLIC_ROUTES.length} />
          <Link href="/projects">Explore projects</Link>
        </Section>
      );
    case "thinking":
      return (
        <Section id={section.id} title="Latest writing">
          <p>{PHASE_ONE_FALLBACK_CONTENT.blog[0]}</p>
          <Link href="/blog">Read the blog</Link>
        </Section>
      );
    case "notes":
      return (
        <Section id={section.id} title="Latest TIE">
          <p>{PHASE_ONE_FALLBACK_CONTENT.tie[0]}</p>
          <Link href="/tie">Browse notes</Link>
        </Section>
      );
    case "education":
      return (
        <Section id={section.id} title="Education">
          <p>{PHASE_ONE_FALLBACK_CONTENT.education[0]}</p>
        </Section>
      );
    case "contact": {
      const calLink = process.env["NEXT_PUBLIC_CAL_LINK"] ?? SITE_IDENTITY.calUrl;
      return (
        <Section id={section.id} title="Contact">
          <p>Have a role, project, or engineering problem to discuss?</p>
          <div className="action-row">
            <Link href="/contact">Send a message</Link>
            <a href={calLink}>Book a call</a>
          </div>
        </Section>
      );
    }
    default:
      return assertNever(section);
  }
}
