import type { Metadata } from "next";
import { DotSystem } from "@/components/dot-system";

export const metadata: Metadata = {
  title: "09_system — Circle field",
  description: "A generative circle-grid map with local networks and typographic obstacle markers.",
};

export default function DotSystemStudy() { return <DotSystem />; }
