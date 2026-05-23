import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb"
    }
  },
  async redirects() {
    return [
      {
        source: "/manual",
        destination: "/liff/manual",
        permanent: true,
      },
      {
        source: "/health",
        destination: "/liff/health",
        permanent: true,
      },
      {
        source: "/upload",
        destination: "/liff/manual",
        permanent: true,
      },
      {
        source: "/liff/liff/:path*",
        destination: "/liff/:path*",
        permanent: true,
      }
    ];
  }
};

export default nextConfig;
