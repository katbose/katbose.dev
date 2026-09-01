"use client";

import { Dialog } from "@base-ui/react/dialog";
import Link from "next/link";

interface MobileMenuLink {
  readonly href: string;
  readonly label: string;
}

interface MobileMenuProps {
  readonly links: readonly MobileMenuLink[];
}

export function MobileMenu({ links }: Readonly<MobileMenuProps>) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="menu-trigger">Menu</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Viewport className="dialog-viewport">
          <Dialog.Popup className="dialog-popup">
            <div className="dialog-heading">
              <Dialog.Title>Navigate</Dialog.Title>
              <Dialog.Close className="dialog-close">Close</Dialog.Close>
            </div>
            <Dialog.Description>Choose a public portfolio page.</Dialog.Description>
            <nav aria-label="All pages" className="dialog-links">
              {links.map((link) => (
                <Dialog.Close key={link.href} render={<Link href={link.href} prefetch={false} />}>
                  {link.label}
                </Dialog.Close>
              ))}
            </nav>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
