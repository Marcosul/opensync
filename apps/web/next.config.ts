import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/dashboard/vaults/new",
        destination: "/vaults/new",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
