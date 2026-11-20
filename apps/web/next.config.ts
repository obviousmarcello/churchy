import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are consumed as TypeScript source.
  transpilePackages: [
    "@churchy/contracts",
    "@churchy/email",
    "@churchy/data-mock",
    "@churchy/db",
    "@churchy/policy",
    "@churchy/hu",
    "@churchy/i18n",
    "@churchy/schedule",
    "@churchy/booking",
    "@churchy/calendar",
    "@churchy/events",
    "@churchy/presets",
    "@churchy/themes",
    "@churchy/ui",
  ],
  poweredByHeader: false,
  async headers() {
    // The workspace is private (D-53 AC3, SDD §20.1): never cached by a CDN or the browser and
    // never indexed.
    return [
      {
        source: "/munkater/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
