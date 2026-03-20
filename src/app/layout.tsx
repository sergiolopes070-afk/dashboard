import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KinouClean – Dashboard",
  description: "Tableau de bord de gestion KinouClean",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="bg-gray-50 min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
