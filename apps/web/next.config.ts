import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are consumed as TypeScript source.
  transpilePackages: [
    "@churchy/contracts",
    "@churchy/data-mock",
    "@churchy/policy",
    "@churchy/hu",
    "@churchy/schedule",
    "@churchy/calendar",
    "@churchy/presets",
    "@churchy/themes",
    "@churchy/ui",
  ],
  poweredByHeader: false,
};

export default nextConfig;
