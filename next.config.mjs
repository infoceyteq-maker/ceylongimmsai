/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // The Arena preview is served through an iframe on https://<port>-<sandbox>.e2b.app.
  // Next.js 16 blocks cross-origin /_next dev resources (HMR, assets) by default,
  // so allow the preview host explicitly. Wildcard covers sandbox id changes.
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;
