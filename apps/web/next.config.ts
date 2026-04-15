import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Permite importar exemplos do clone `refs/plate` (fora de `apps/web`). */
  experimental: {
    externalDir: true,
  },
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
