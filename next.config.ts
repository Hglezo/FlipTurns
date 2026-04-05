import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/favicon.ico", destination: "/icon-32.png?v=2", permanent: false },
    ];
  },
};

export default nextConfig;
