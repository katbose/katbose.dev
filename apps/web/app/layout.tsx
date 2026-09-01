import { SITE_IDENTITY } from "@katbose/shared";
import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { IntroLoader } from "@/components/common/intro-loader";
import { BottomBar } from "@/components/layout/bottom-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SITE_URL } from "@/lib/site-url";
import { Providers } from "./providers";
import "./globals.css";

const sans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "optional",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-jetbrains-mono",
  display: "optional",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_IDENTITY.name} — ${SITE_IDENTITY.role}`,
    template: `%s — ${SITE_IDENTITY.name}`,
  },
  description: "A fast, accessible portfolio readable by humans and AI agents.",
  icons: {
    icon: [
      { url: "/favicon-v1-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-v1-48.png", type: "image/png", sizes: "48x48" },
      { url: "/favicon-v1-192.png", type: "image/png", sizes: "192x192" },
      { url: "/favicon-v1-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/favicon-v1-180.png", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className={`${sans.variable} ${mono.variable}`} lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <a className="skip-link" href="#content">
            Skip to content
          </a>
          <BottomBar />
          <IntroLoader />
          <div className="site-shell">
            <header className="site-header">
              <a className="site-mark" href="/" aria-label="KatBose home">
                KB
              </a>
              <ThemeToggle />
            </header>
            {children}
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
