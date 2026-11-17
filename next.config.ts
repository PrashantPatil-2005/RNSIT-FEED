import type { NextConfig } from "next";

// Baseline hardening headers. A Content-Security-Policy is deliberately NOT set yet: it needs a
// nonce strategy that fits Next.js and should be designed together with authentication.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Pin the project root: a stray lockfile in a parent folder otherwise confuses root detection.
  turbopack: { root: process.cwd() },
  reactStrictMode: true,
  poweredByHeader: false,
  // Search lives on /experiences. A config redirect returns a real 307 (query string kept), which
  // a page-level redirect() inside a streamed response cannot.
  async redirects() {
    return [{ source: "/search", destination: "/experiences", permanent: false }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
