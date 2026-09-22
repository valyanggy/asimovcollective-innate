import type { Metadata } from "next";
import { DotSystem } from "@/components/dot-system";

export const metadata: Metadata = {
  title: "Text Area_export",
  description: "Export the text-area dither field as transparent PNG or vector SVG without the LED grid.",
};

export default function TextAreaExportStudy() {
  return <DotSystem dither figure="/figures/morph/1.png" pushMorph editableImages sequenceStudio typeArea typeAreaExport />;
}
