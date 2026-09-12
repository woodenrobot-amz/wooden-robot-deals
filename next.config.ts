import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    CLOUDFLARE_PAGE_REWRITE_MODEL: "@cf/google/gemma-4-26b-a4b-it",
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
