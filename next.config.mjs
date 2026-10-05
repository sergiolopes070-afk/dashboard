/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Chromium/puppeteer ne doivent pas être « bundlés » : ils lisent leurs
  // binaires depuis node_modules au runtime (génération du devis PDF).
  experimental: {
    serverComponentsExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
    // Le traçage auto de Next n'embarque PAS les binaires .br de Chromium
    // (chemin résolu dynamiquement) : on les force dans les fonctions qui
    // génèrent le PDF, sinon « Chromium introuvable » au runtime Vercel.
    outputFileTracingIncludes: {
      "/api/prospects/**": ["./node_modules/@sparticuz/chromium/bin/**"],
      "/api/cron/**": ["./node_modules/@sparticuz/chromium/bin/**"],
    },
  },
};

export default nextConfig;
