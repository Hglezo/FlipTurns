import type { MetadataRoute } from "next";

const iconCacheBust = "?v=2";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FlipTurns",
    short_name: "FlipTurns",
    description: "Coach and swimmer workout calendar",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: `/icon-192.png${iconCacheBust}`,
        type: "image/png",
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: `/icon-512.png${iconCacheBust}`,
        type: "image/png",
        sizes: "512x512",
        purpose: "any",
      },
    ],
  };
}
