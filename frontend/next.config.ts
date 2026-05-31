import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // التلخيص/الصهر قد يستغرقان دقائق — الافتراضي 30s يسبب 500
    proxyTimeout: 600_000,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/:path*",
      },
    ];
  },
};

export default nextConfig;
