import type { Metadata } from "next";
import { Reveal } from "@/components/common/reveal";

export const metadata: Metadata = {
  title: "Reveal probe",
  robots: { index: false, follow: false },
};

export default function RevealProbePage() {
  return (
    <main id="content">
      <Reveal>
        <p data-probe="reveal">Reveal probe</p>
      </Reveal>
    </main>
  );
}
