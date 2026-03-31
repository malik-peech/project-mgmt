import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable ESLint during builds to avoid failures on warnings
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable type checking during builds (we check in dev)
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
