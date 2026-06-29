/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  async redirects() {
    return [
      {
        source: "/nfc",
        destination: "https://g.page/r/CXaV5vRY-MysEBM/review",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
