import type { Metadata } from "next";
import { DotSystem } from "@/components/dot-system";

export const metadata: Metadata = {
  title: "09_2 — Rectangle field",
  description: "Draggable typography and rectangular density fields that merge through a shared grid.",
};

export default function RectangleSystemStudy() { return <DotSystem rectangular />; }
