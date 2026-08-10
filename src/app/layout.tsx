import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KinouClean – Dashboard",
  description: "Tableau de bord de gestion KinouClean",
  manifest: "/manifest.webmanifest",
  // Installable comme une app sur iPhone (plein écran, nom court).
  appleWebApp: { capable: true, title: "KinouClean", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1C3557",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Applique le thème sombre AVANT le rendu → aucun flash clair, sur toutes les pages. */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('darkMode')==='true')document.documentElement.classList.add('dark')}catch(e){}" }} />
      </head>
      <body className="bg-gray-50 min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
