"use client";

import { Dialog } from "@base-ui/react/dialog";
import Link from "next/link";
import { PUBLIC_ROUTES } from "@/lib/routes";

export function MobileMenu() {
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
              {PUBLIC_ROUTES.filter((route) => route.navigation).map((route) => (
                <Dialog.Close key={route.path} render={<Link href={route.path} />}>
                  {route.label}
                </Dialog.Close>
              ))}
              <Dialog.Close render={<Link href="/agent" />}>Agent view</Dialog.Close>
            </nav>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
