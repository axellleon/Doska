import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@doska/shared", "@doska/canvas-core"],
};

export default nextConfig;
