/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Le devis PDF est généré avec @react-pdf/renderer (100 % JS). On l'externalise
  // du bundle serveur pour éviter les soucis d'empaquetage (fontkit, fs…).
  experimental: {
    serverComponentsExternalPackages: ["@react-pdf/renderer"],
  },
};

export default nextConfig;
