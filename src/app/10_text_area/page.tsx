import type { Metadata } from "next";
import { DotSystem } from "@/components/dot-system";

export const metadata: Metadata = {
  title: "10_text area",
  description: "Sequence live type through the morph field: every slot is a text block, edited from one shared sequence GUI.",
};

export default function TextAreaStudy() {
  return <DotSystem dither figure="/figures/morph/1.png" pushMorph editableImages sequenceStudio typeArea />;
}
