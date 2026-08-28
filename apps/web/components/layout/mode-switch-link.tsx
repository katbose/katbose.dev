"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { CROSSFADE_DURATION_MS } from "@/lib/motion";

/**
 * Navigation link that crossfades when the visitor switches between the human
 * and agent views.
 *
 * The design catalogue specifies a 350ms crossfade for this one transition
 * (docs/19-design-reference.md §19.3, `--dur-crossfade`). The animation is armed
 * on click rather than applied to the page itself, which matters for two
 * reasons:
 *
 * - a cold visit paints with no animation at all, so Largest Contentful Paint is
 *   never delayed by a decorative fade;
 * - the attribute is set before the incoming route paints, so the fade starts
 *   from transparent instead of flashing in after the fact.
 *
 * Any other navigation is left untouched.
 */

/** The two paths that represent a content mode. */
const MODE_PATHS: ReadonlySet<string> = new Set(["/", "/agent"]);

/** Consumed by the `[data-mode-crossfade]` rule in `globals.css`. */
const CROSSFADE_ATTRIBUTE = "data-mode-crossfade";

interface ModeSwitchLinkProps {
  readonly href: string;
  readonly className?: string;
  readonly children: ReactNode;
}

export function ModeSwitchLink({ href, className, children }: Readonly<ModeSwitchLinkProps>) {
  const pathname = usePathname();

  const armCrossfade = useCallback(() => {
    if (pathname === href || !MODE_PATHS.has(pathname) || !MODE_PATHS.has(href)) return;
    // Respect the visitor's motion preference directly. The stylesheet also
    // disables the animation, but not arming it avoids the work entirely.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    root.setAttribute(CROSSFADE_ATTRIBUTE, "");
    // Self-clearing: the attribute must not survive the transition, or a later
    // navigation would replay the fade.
    window.setTimeout(() => root.removeAttribute(CROSSFADE_ATTRIBUTE), CROSSFADE_DURATION_MS);
  }, [href, pathname]);

  return (
    <Link className={className} href={href} onClick={armCrossfade}>
      {children}
    </Link>
  );
}
