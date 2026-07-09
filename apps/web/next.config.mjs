/** @type {import('next').NextConfig} */

// Keep production builds OUT of the dev server's build dir. `next dev` runs with
// NODE_ENV=development and uses `.next`; `next build`/`next start` run with
// NODE_ENV=production and use `.next-prod`. This means running a production
// build never overwrites the chunks the running dev server is serving (which
// otherwise causes _next/static/chunks 404s and a dead, un-hydrated page).
//
// A second dev server on the same repo (e.g. another tool's `next dev`) sharing
// `.next` causes the same 404s via clobbered chunk hashes. Set NEXT_DIST_DIR to
// give a dev server its own build dir and isolate it from the collision.
const isProd = process.env.NODE_ENV === 'production';
const devDistDir = process.env.NEXT_DIST_DIR || '.next';

const nextConfig = {
  distDir: isProd ? '.next-prod' : devDistDir,
  // Transpile workspace packages that ship raw TypeScript.
  transpilePackages: ['@cytolab/animations', '@cytolab/types', '@cytolab/config'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: 'http://localhost:4000/api/v1/:path*', // proxy to NestJS in dev
      },
    ];
  },
  // Legacy/alias paths → the real pages. The Samples list lives at /records and
  // authorized results at /result-sheets; /specimens and /results are not routes
  // and previously 404'd (QA-M3).
  async redirects() {
    return [
      { source: '/specimens', destination: '/records', permanent: false },
      { source: '/specimens/:path*', destination: '/records', permanent: false },
      { source: '/results', destination: '/result-sheets', permanent: false },
      { source: '/results/:path*', destination: '/result-sheets', permanent: false },
    ];
  },
};

export default nextConfig;
