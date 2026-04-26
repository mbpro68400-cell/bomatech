import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@bomatech/ui"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
