import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SleepFixMe",
    short_name: "SleepFixMe",
    description: "SleepFixMe helps you log nights, detect sleep patterns, and follow RRSM protocols.",
    start_url: "/protected/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1f1fb8",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
