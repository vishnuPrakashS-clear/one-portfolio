import type { Metadata, Viewport } from "next";
import type { PropsWithChildren } from "react";
import { siteConfig } from "@/config";
import { Providers } from "@/components/providers/providers";
import { SpaceBackground } from "@/components/main/space-background";
import { Navbar } from "@/components/main/navbar";
import { Footer } from "@/components/main/footer";
import { AppShell } from "@/components/main/app-shell";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#030014",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export const metadata: Metadata = siteConfig;

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en-IN">
      <body className="overflow-x-hidden overflow-y-scroll">
        <a href="#main" className="absolute -top-16 left-3 z-[70] rounded-full bg-ink px-4 py-2.5 font-semibold text-space focus:top-3">
          Skip to content
        </a>
        <Providers>
          <SpaceBackground />
          <Navbar />
          <AppShell>{children}</AppShell>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
