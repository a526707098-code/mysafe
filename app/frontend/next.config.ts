import path from "node:path";
import type { NextConfig } from "next";

// Pin the project root: the repo above this directory has its own lockfile.
const root = path.dirname(new URL(import.meta.url).pathname);

// Static security headers. The Content-Security-Policy is set per request in
// src/proxy.ts because it carries a fresh nonce; Nginx adds HSTS once TLS is on.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: root,
  turbopack: { root },
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Nothing in the vault may be cached by the browser or an intermediary.
      { source: "/((?!_next/static).*)", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
