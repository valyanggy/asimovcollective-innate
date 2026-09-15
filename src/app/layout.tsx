import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Color field — 3D claw interaction",
  description: "An editable 3D claw interaction study with front and angled projections, two opposing pivoting jaws, and a proximity field.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
