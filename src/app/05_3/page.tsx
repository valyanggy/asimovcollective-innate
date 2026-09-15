import type { Metadata } from "next";
import { ColorField } from "@/components/color-field";
export const metadata: Metadata = {
  title: "05_3 — Color field layers",
  description: "A larger canvas with rounded rectangular marks and three adjustable depth layers.",
};
export default function CompositionStudy() {
  return <ColorField key="05_3" variant="05_3" />;
}
