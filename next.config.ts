import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Node-native 0G SDKs out of the client/edge bundle.
  serverExternalPackages: [
    "@0gfoundation/0g-compute-ts-sdk",
    "@0gfoundation/0g-ts-sdk",
    // Transitive dep of the compute SDK — must stay external (Node/dynamic-require
    // heavy); bundling it crashes the route at runtime in live mode.
    "circomlibjs",
  ],
};

export default nextConfig;
