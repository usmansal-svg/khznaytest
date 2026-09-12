import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Lets a second dev server run alongside the first without sharing .next.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
