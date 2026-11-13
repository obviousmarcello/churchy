import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are consumed as TypeScript source.
  transpilePackages: [
    "@churchy/contracts",
    "@churchy/data-mock",
    "@churchy/policy",
    "@churchy/hu",
    "@churchy/i18n",
    "@churchy/schedule",
    "@churchy/calendar",
    "@churchy/presets",
    "@churchy/themes",
    "@churchy/ui",
  ],
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
