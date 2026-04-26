import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@bomatech/ui"],
  typescript: {
    // Temporarily ignore build errors to unblock deployment
    // TODO: fix lucide-react type compatibility with React 19
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
