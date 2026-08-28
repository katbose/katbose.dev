import Link from "next/link";
import { MobileMenu } from "./mobile-menu";
import { ModeSwitchLink } from "./mode-switch-link";

const SECONDARY_LINKS = [
  { href: "/projects", label: "Projects" },
  { href: "/resume", label: "Resume" },
] as const;

export function BottomBar() {
  return (
    <nav aria-label="Primary" className="bottom-bar">
      {/* Home and Agent are the two content modes, so both arm the crossfade. */}
      <ModeSwitchLink href="/">Home</ModeSwitchLink>
      {SECONDARY_LINKS.map((route) => (
        <Link href={route.href} key={route.href}>
          {route.label}
        </Link>
      ))}
      <ModeSwitchLink className="agent-switch" href="/agent">
        Agent
      </ModeSwitchLink>
      <MobileMenu />
    </nav>
  );
}
