import { SITE_IDENTITY } from "@katbose/shared";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        © {new Date().getUTCFullYear()} {SITE_IDENTITY.name}. Built for people and agents.
      </p>
      <nav aria-label="Footer">
        <Link href="/privacy">Privacy</Link>
        <a href={SITE_IDENTITY.githubUrl} rel="me">
          GitHub
        </a>
        <a href={SITE_IDENTITY.linkedInUrl} rel="me">
          LinkedIn
        </a>
      </nav>
    </footer>
  );
}
