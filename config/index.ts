import type { Metadata } from "next";

/** Public Supabase settings. The publishable key is meant to be public: row-level security in the database decides
    what each signed-in person can read or change (see supabase/migrations). Override with NEXT_PUBLIC_* at build time. */
export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iyzxzurxeddznihyrhfw.supabase.co",
  key: process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_oeiH76MPVzHDtxx4tFv91A_yKXzSwKZ",
};

export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/one-portfolio";

export const siteConfig: Metadata = {
  title: { default: "One Portfolio", template: "%s · One Portfolio" },
  description:
    "Your Indian and global investments in one clear 3D dashboard: every number from your own statements, a goal check, and where your monthly investing leads.",
  applicationName: "One Portfolio",
  robots: { index: false, follow: false },
  icons: { icon: `${basePath}/icon.svg` },
};
