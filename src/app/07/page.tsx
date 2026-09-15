import type { Metadata } from "next";
import { FaceField } from "@/components/face-field";

export const metadata: Metadata = {
  title: "07 — Face field",
  description: "The Innate robot portrait as a flat field of blue text pills, with fine facial detail and larger background cells.",
};

export default function FaceStudy() {
  return <FaceField />;
}
