import { SITE_IDENTITY } from "@katbose/shared";
import type { ReactNode } from "react";
import type { PublicPath } from "@/lib/routes";
import { JsonLd } from "./json-ld";

interface PageIntroProps {
  path: PublicPath;
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}

export function PageIntro({
  path,
  eyebrow,
  title,
  description,
  children,
}: Readonly<PageIntroProps>) {
  return (
    <header className="page-intro">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: SITE_IDENTITY.siteUrl },
            {
              "@type": "ListItem",
              position: 2,
              name: title,
              item: `${SITE_IDENTITY.siteUrl}${path}`,
            },
          ],
        }}
      />
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </header>
  );
}
