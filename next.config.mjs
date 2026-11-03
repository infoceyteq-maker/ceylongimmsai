/**
 * GIMMS — Next.js configuration (hardened in Phase 1).
 *
 * Changes vs. the pre-audit version:
 *  - `poweredByHeader: false` — stop advertising the exact Next.js version. The
 *    audit found `X-Powered-By: Next.js` on every response, which is free
 *    fingerprinting data for an attacker matching a disclosed CVE.
 *  - `serverExternalPackages` — keep playwright/browser drivers out of the bundler
 *    so the Agent worker can be added without breaking `next build`.
 *  - Long-lived immutable caching for hashed static assets; strict no-store is set
 *    per-route in the code, not globally, so real assets keep their cache.
 *  - `allowedDevOrigins` is DEV-ONLY and is ignored in production by Next.js.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,

  // Never disclose the framework/version.
  poweredByHeader: false,

  // Correlate logs without emitting any secret.
  generateBuildId: async () => {
    return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || `gimms-${Date.now()}`;
  },

  // Browser-automation packages must stay outside the server bundle. They are
  // only used by the Agent worker, never by a page.
  serverExternalPackages: ["playwright-core", "puppeteer-core"],

  // The Arena preview is served through an iframe on https://<port>-<sandbox>.e2b.app.
  // Next.js 16 blocks cross-origin /_next dev resources (HMR, assets) by default,
  // so allow the preview host explicitly. Wildcard covers sandbox id changes.
  // This has no effect on a production Vercel deployment.
  allowedDevOrigins: ["*.e2b.app"],

  async headers() {
    return [
      {
        // Hashed build output is immutable by definition.
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Belt-and-braces: the admin area is never cacheable, even if middleware
        // were bypassed by an edge case.
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/api/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
