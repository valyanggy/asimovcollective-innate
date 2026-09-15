import type { Metadata } from "next";
import { ColorField } from "@/components/color-field";

export const metadata: Metadata = { title: "05_2 — Color field objects", description: "A chess knight, football, and single sock in the 3D claw study." };

export default function ObjectsStudy() {
  return <ColorField key="05_2" variant="05_2" />;
}
