import Link from "next/link";
import { MobileMenu } from "./mobile-menu";

const PRIMARY_LINKS = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/resume", label: "Resume" },
] as const;

export function BottomBar() {
  return (
    <nav aria-label="Primary" className="bottom-bar">
      {PRIMARY_LINKS.map((route) => (
        <Link href={route.href} key={route.href}>
          {route.label}
        </Link>
      ))}
      <Link className="agent-switch" href="/agent">
        Agent
      </Link>
      <MobileMenu />
    </nav>
  );
}
