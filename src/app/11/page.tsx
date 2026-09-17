import type { Metadata } from "next";
import { DotSystem } from "@/components/dot-system";

export const metadata: Metadata = {
  title: "11 — Grid cells",
  description: "Draggable lettered cells on the LED grid that merge by proximity.",
};

export default function DotGridStudy() {
  return <DotSystem gridOnly />;
}
