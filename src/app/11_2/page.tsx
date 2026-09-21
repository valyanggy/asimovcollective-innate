import type { Metadata } from "next";
import { DotSystem } from "@/components/dot-system";

export const metadata: Metadata = {
  title: "11_2 — Dithered image merge",
  description: "Split a dithered wordmark into letter islands and merge nearby strokes with adhesion and reach.",
};

export default function DitheredImageMergeStudy() {
  return <DotSystem dither figure="/figures/intelligence.png" ditherImage imageMerge />;
}
