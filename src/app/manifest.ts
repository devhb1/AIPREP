import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Prep — Your AI Interview Mentor",
    short_name: "AI Prep",
    description: "Mock interviews, mentor coaching, and an adaptive prep plan.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f3f6fb",
    theme_color: "#0d9488",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/aiprep-logo.jpg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "any",
      },
    ],
  };
}
