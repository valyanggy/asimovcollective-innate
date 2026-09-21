import type { Metadata } from "next";
import { DotSystem } from "@/components/dot-system";

export const metadata: Metadata = {
  title: "10_5 — Morph sequence",
  description: "Play a two-act appear sequence: first center and surrounds, then a new center with a new surround set.",
};

export default function MorphSequenceStudy() {
  return <DotSystem dither figure="/figures/morph/1.png" pushMorph editableImages sequenceStudio />;
}
