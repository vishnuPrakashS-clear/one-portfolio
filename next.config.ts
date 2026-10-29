import type { NextConfig } from "next";

/** Static export for GitHub Pages. The site lives under /one-portfolio unless NEXT_PUBLIC_BASE_PATH says otherwise. */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/one-portfolio";

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
