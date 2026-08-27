import type { ReactNode } from "react";
import type { PublicPath } from "@/lib/routes";
import { SITE_URL } from "@/lib/site-url";
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
            { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
            {
              "@type": "ListItem",
              position: 2,
              name: title,
              item: `${SITE_URL}${path}`,
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
