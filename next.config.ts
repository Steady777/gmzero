import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Node-native 0G SDKs out of the client/edge bundle.
  serverExternalPackages: [
    "@0gfoundation/0g-compute-ts-sdk",
    "@0gfoundation/0g-ts-sdk",
    "circomlibjs",
  ],
};

export default nextConfig;
