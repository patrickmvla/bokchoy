/** Next.js config. Reverse-proxy to backend per [[auth-surface-mount]] (V3) + [[cockpit-stack-integration-research]] F1. */

import type { NextConfig } from 'next';

const backendUrl = process.env.BOKCHOY_BACKEND_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,

  // Pin Turbopack root: Next 16's lockfile-walk can land on a stray $HOME lockfile and demote bun.lock.
  // `new URL` (not node:path) because next.config.compiled.js is CJS and a runtime `import` crashes config load.
  turbopack: {
    root: new URL('../..', import.meta.url).pathname,
  },

  async rewrites() {
    return [
      {
        source: '/api/auth/:path*',
        destination: `${backendUrl}/api/auth/:path*`,
      },
      {
        source: '/v1/:path*',
        destination: `${backendUrl}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
