import type { Metadata } from "next";
import { DotSystem } from "@/components/dot-system";

export const metadata: Metadata = {
  title: "10_push/button — Push button",
  description: "The push-button figure dithered on the default field grid like an LED screen.",
};

export default function PushButtonStudy() {
  return <DotSystem dither figure="/figures/push-button.svg" />;
}
