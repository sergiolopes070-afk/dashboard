import type { MetadataRoute } from "next";

// Manifeste PWA : permet d'installer le dashboard comme une application
// (écran d'accueil, plein écran, nom + icône propres).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KinouClean – Dashboard",
    short_name: "KinouClean",
    description: "Gestion KinouClean : clients, agenda, dépenses, stock",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f0f1a",
    theme_color: "#1C3557",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
