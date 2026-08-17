import type { Metadata, Viewport } from "next";
import { PwaControls } from "./pwa-controls";
import { isAdminSurface } from "@/lib/app-surface";
import "./globals.css";

const publicMetadata: Metadata = {
  title: {
    default: "Wooden Robot Deals",
    template: "%s | Wooden Robot",
  },
  description:
    "Curated deals for tools, garage, tech, EDC, and useful guy stuff.",
  applicationName: "Wooden Robot Deals",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Wooden Robot",
    startupImage: [
      {
        url: "/splash/splash-750x1334.png",
        media:
          "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)",
      },
      {
        url: "/splash/splash-1170x2532.png",
        media:
          "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/splash-1290x2796.png",
        media:
          "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
      },
    ],
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

const adminMetadata: Metadata = {
  title: {
    default: "Wooden Robot Posting Desk",
    template: "%s | Wooden Robot Posting Desk",
  },
  description: "Plan daily deals and copy post or comment text fast.",
  applicationName: "Wooden Robot Posting Desk",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Posting Desk",
  },
  icons: {
    icon: [{ url: "/icons/admin-icon.svg", type: "image/svg+xml" }],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const metadata: Metadata = isAdminSurface
  ? adminMetadata
  : publicMetadata;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#09090b",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    "development";

  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PwaControls
          version={version}
          surface={isAdminSurface ? "admin" : "public"}
        />
      </body>
    </html>
  );
}
