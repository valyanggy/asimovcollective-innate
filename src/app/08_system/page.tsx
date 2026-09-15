import type { Metadata } from "next";
import { CircleSystem } from "@/components/circle-system";

export const metadata: Metadata = {
  title: "08_system — Quarter-circle system",
  description: "Eight generative patterns built from connected quarter-, half-, and three-quarter-circle outlines, with adjustable motion and density.",
};
export default function CircleSystemStudy() { return <CircleSystem />; }
