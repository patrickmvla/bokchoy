// Next.js 16 config per [[frontend-stack]] + [[auth-surface-mount]] (V3) +
// [[cockpit-stack-integration-research]] F1 reverse-proxy (P1).
//
// Env-driven async rewrites proxy /api/auth/:path* + /v1/:path* to the
// backend container. Browser sees first-party requests; cookies work without
// SameSite=None/Safari-ITP complexity per Better Auth concepts/cookies docs.
//
// BOKCHOY_BACKEND_URL precedence:
//   - Production: set via Vercel project env (e.g., https://api.bokchoy.com)
//   - Preview deploys: set via Vercel env (e.g., https://api-staging.bokchoy.com)
//   - Local dev: defaults to http://localhost:3000

import type { NextConfig } from 'next';

const backendUrl = process.env.BOKCHOY_BACKEND_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  // Cache Components opt-in per [[frontend-stack]] — enables sub-50ms TTFB on
  // personalized routes via `"use cache"` directive on selectively cached
  // server components. Live-ops uncached/per-request inside Suspense
  // boundaries; slow-changing data cached with cacheLife profiles.
  cacheComponents: true,

  // React 19 + React Compiler 1.0 per [[frontend-stack]]. Requires
  // `babel-plugin-react-compiler` dep (in devDependencies).
  reactCompiler: true,

  // Pin the workspace root for Turbopack. Next.js 16's lockfile-based
  // auto-detect walks UP from cwd and picks the first lockfile it finds,
  // which can land on a stray ~/package-lock.json outside the monorepo
  // (verified 2026-05-12: `next dev` selected `/home/mvula/package-lock.json`
  // as root and demoted `bun.lock` to an "additional lockfile"). The pin
  // forces the monorepo root regardless of operator $HOME state.
  //
  // `new URL(..., import.meta.url)` is used to compute the path because
  // Next.js's config loader emits CJS to `next.config.compiled.js` and any
  // runtime `import` (e.g. `node:path`, `node:url`) collides with this
  // app's `"type": "module"` and crashes config load with `ReferenceError:
  // exports is not defined`. `new URL` and `import.meta.url` are language
  // built-ins, so no import is needed — and unlike string concat with
  // `import.meta.dirname`, the URL parser normalizes `..` segments, which
  // Turbopack requires (it rejects paths containing `..` as outside the
  // project directory).
  //
  // Walks back [[cockpit/nextjs-scaffold-research]] F6's "redundant pin"
  // claim — auto-detect is fragile to stray lockfiles above the repo.
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
