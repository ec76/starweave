import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  transpilePackages: ["@repo/ui"],
  // The development pool holder is shared across app-route/app-rsc bundles.
  // mssql maps SQL types by function identity; keep pool and binding identities
  // in Node's module cache instead of separate Next.js module graphs.
  serverExternalPackages: ["mssql", "tedious"],
};

export default nextConfig;
