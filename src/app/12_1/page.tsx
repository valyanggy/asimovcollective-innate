import type { Metadata } from "next";
import { DotSystem } from "@/components/dot-system";

export const metadata: Metadata = {
  title: "12_1 — Combined media",
  description: "Rebuild a cut-out subject with dithered 0918 cells.",
};

export default function CombinedMediaStudy() {
  return <DotSystem dither figure="/figures/innate-plant-cutout.jpg" ditherImage mediaPair />;
}
