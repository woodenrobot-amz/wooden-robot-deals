import type { MetadataRoute } from "next";
import { isAdminSurface } from "@/lib/app-surface";

export default function manifest(): MetadataRoute.Manifest {
  if (isAdminSurface) {
    return {
      id: "/",
      name: "Wooden Robot Posting Desk",
      short_name: "Posting Desk",
      description: "Plan daily deals and copy post or comment text fast.",
      start_url: "/admin/deal-schedule",
      scope: "/",
      display: "standalone",
      background_color: "#090b10",
      theme_color: "#090b10",
      categories: ["business", "productivity"],
      icons: [
        {
          src: "/icons/admin-icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icons/admin-icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icons/admin-icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    };
  }

  return {
    id: "/",
    name: "Wooden Robot Deals",
    short_name: "Wooden Robot",
    description:
      "Curated deals for tools, garage, tech, EDC, and useful guy stuff.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#09090b",
    theme_color: "#09090b",
    categories: ["shopping", "lifestyle"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
