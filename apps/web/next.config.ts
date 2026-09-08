import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@hpc/shared"],
  poweredByHeader: false,
};
export default config;
