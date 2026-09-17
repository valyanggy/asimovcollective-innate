import type { Metadata } from "next";
import { DotSystem } from "@/components/dot-system";

export const metadata: Metadata = {
  title: "10_push/button — Innate OS",
  description: "The Innate OS chat image centered on the default LED field grid.",
};

export default function PushButtonStudy() {
  return <DotSystem dither figure="/figures/innate-os-card.png" />;
}
