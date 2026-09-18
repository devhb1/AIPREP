import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AIPREP Mentor OS",
    short_name: "AIPREP",
    description: "KVS PRT interview prep — mentor, research, mocks, voice.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#eef2f6",
    theme_color: "#0f766e",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
