import type { Metadata } from "next";
import { DotSystem } from "@/components/dot-system";

export const metadata: Metadata = {
  title: "09_3 — Four agents",
  description: "Four draggable text agents in a monochrome metaball dot field.",
};

export default function MultiAgentStudy() { return <DotSystem multiple />; }
