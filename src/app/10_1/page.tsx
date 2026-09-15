import type { Metadata } from "next";
import { DotSystem } from "@/components/dot-system";

export const metadata: Metadata = {
  title: "10_1 — Cell system",
  description: "Four draggable text agents whose metaball connections are dithered with a swappable circular cell.",
};

export default function CellSystemStudy() { return <DotSystem multiple dither />; }
