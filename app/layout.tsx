import type { Metadata, Viewport } from "next";
import type { PropsWithChildren } from "react";
import { siteConfig } from "@/config";
import { Providers } from "@/components/providers/providers";
import { Navbar } from "@/components/main/navbar";
import { Backdrop } from "@/components/main/backdrop";
import { Footer } from "@/components/main/footer";
import { AppShell } from "@/components/main/app-shell";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0e10" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export const metadata: Metadata = siteConfig;

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="overflow-x-hidden overflow-y-scroll">
        <a href="#main" className="absolute -top-16 left-3 z-[70] rounded-full bg-ink px-4 py-2.5 font-semibold text-page focus:top-3">
          Skip to content
        </a>
        <Providers>
          <Backdrop />
          <Navbar />
          <AppShell>{children}</AppShell>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
