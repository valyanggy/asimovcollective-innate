import type { Metadata } from "next";
import { DotSystem } from "@/components/dot-system";

export const metadata: Metadata = {
  title: "11_1 — Dithered image",
  description: "Dither a source image with the morph building-block cells on the LED grid.",
};

export default function DitheredImageStudy() {
  return <DotSystem dither figure="/figures/intelligence.png" ditherImage />;
}
