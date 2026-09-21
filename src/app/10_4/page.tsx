import type { Metadata } from "next";
import { DotSystem } from "@/components/dot-system";

export const metadata: Metadata = {
  title: "10_4 — Draggable Morph Images",
  description: "Upload and drag images through the continuous dithered morph field.",
};

export default function DraggableMorphStudy() {
  return <DotSystem dither figure="/figures/morph/1.png" pushMorph editableImages />;
}
