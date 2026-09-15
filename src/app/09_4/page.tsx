import type { Metadata } from "next";
import { DotSystem } from "@/components/dot-system";

export const metadata: Metadata = {
  title: "09_4 — Connected agents",
  description: "Four draggable text components joined by an anchored, curved network with hollow junctions.",
};

export default function NeuralFieldStudy() { return <DotSystem multiple neurons />; }
