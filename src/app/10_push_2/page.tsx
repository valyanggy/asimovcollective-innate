import type { Metadata } from "next";
import { DotSystem } from "@/components/dot-system";

export const metadata: Metadata = {
  title: "10_push_2 — Innate OS Morph",
  description: "The Innate OS and MARS steps merge through one continuous dithered density field.",
};

export default function PushMorphStudy() {
  return <DotSystem dither figure="/figures/innate-os-card.png" pushMorph />;
}
