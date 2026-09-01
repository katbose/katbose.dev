"use client";

import { Accordion } from "@base-ui/react/accordion";
import { Collapsible } from "@base-ui/react/collapsible";
import { useState } from "react";
import type { TechnologyItem } from "@/lib/fallback-content";
import { CountUp } from "./count-up";

export function ExperiencePreview({ items }: Readonly<{ items: readonly string[] }>) {
  return (
    <Accordion.Root className="accordion">
      <Accordion.Item value="focus">
        <Accordion.Header>
          <Accordion.Trigger>
            Current focus <span aria-hidden="true">+</span>
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel className="accordion-panel">
          <div className="panel-inner">
            <ul>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </Accordion.Panel>
      </Accordion.Item>
      <Accordion.Item value="previous">
        <Accordion.Header>
          <Accordion.Trigger>
            Previously <span aria-hidden="true">+</span>
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel className="accordion-panel">
          <div className="panel-inner">
            <p>Earlier work and verified role details will come from Payload in Phase 2.</p>
          </div>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  );
}

function BrandMark({ item }: Readonly<{ item: TechnologyItem }>) {
  return (
    <span className="brand-mark">
      <svg aria-hidden="true" className="brand-icon" viewBox="0 0 24 24">
        <path d={item.path} fill="currentColor" />
      </svg>
      <span>{item.name}</span>
    </span>
  );
}

export function TechStackPreview({ items }: Readonly<{ items: readonly TechnologyItem[] }>) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible.Root className="collapsible" onOpenChange={setOpen} open={open}>
      <div className="marquee" aria-label="Technology stack">
        <div className="marquee-track">
          {[...items, ...items].map((item, index) => (
            <span aria-hidden={index >= items.length} key={`${item.name}-${index}`}>
              <BrandMark item={item} />
            </span>
          ))}
        </div>
      </div>
      <Collapsible.Trigger>{open ? "Hide categories" : "View categories"}</Collapsible.Trigger>
      <Collapsible.Panel className="collapsible-panel">
        <ul className="tag-list">
          {items.map((item) => (
            <li key={item.name}>
              <BrandMark item={item} />
            </li>
          ))}
        </ul>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

export function StoryPreview({ text }: Readonly<{ text: string }>) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible.Root className="collapsible" onOpenChange={setOpen} open={open}>
      <Collapsible.Trigger>{open ? "Show less" : "View more"}</Collapsible.Trigger>
      <Collapsible.Panel className="collapsible-panel">
        <p>{text}</p>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

export function ProjectStat({ value }: Readonly<{ value: number }>) {
  return (
    <p className="project-stat">
      <CountUp value={value} suffix=" routes" /> from one typed manifest.
    </p>
  );
}
