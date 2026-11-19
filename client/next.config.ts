import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['mongodb', 'bcryptjs'],
  experimental: {
    cpus: 1,
  },
};

export default nextConfig;
