/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 's3.cedynhq.com',
      },
      ...(process.env.NODE_ENV === 'development' ? [{
        protocol: 'http',
        hostname: 'localhost',
      }] : []),
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    // Legacy /press-research/* routes now live under /insights and /press.
    // Consolidated here from 16 identical one-line redirect page components.
    return [
      { source: '/press-research', destination: '/insights', permanent: true },
      { source: '/press-research/annual-flagship', destination: '/insights/reports', permanent: true },
      { source: '/press-research/articles', destination: '/insights/reports', permanent: true },
      { source: '/press-research/data-brief', destination: '/insights/latest', permanent: true },
      { source: '/press-research/index-updates', destination: '/insights/indices', permanent: true },
      { source: '/press-research/market-flash', destination: '/insights/latest', permanent: true },
      { source: '/press-research/market-insights', destination: '/insights/latest', permanent: true },
      { source: '/press-research/market-reports', destination: '/insights/reports', permanent: true },
      { source: '/press-research/marketbeat', destination: '/insights/marketbeat', permanent: true },
      { source: '/press-research/podcasts', destination: '/insights/podcasts-video', permanent: true },
      { source: '/press-research/policy-papers', destination: '/insights/policy-papers', permanent: true },
      { source: '/press-research/press-releases', destination: '/press/releases', permanent: true },
      { source: '/press-research/research-reports', destination: '/insights/reports', permanent: true },
      { source: '/press-research/special-reports', destination: '/insights/special-reports', permanent: true },
      { source: '/press-research/video-commentary', destination: '/insights/podcasts-video', permanent: true },
      { source: '/press-research/webinars', destination: '/insights/podcasts-video', permanent: true },
    ];
  },
  async rewrites() {
    return [
      {
        // Exclude NextAuth routes from the API proxy
        source: '/api/auth/:path*',
        destination: '/api/auth/:path*',
      },
      // NOTE: the Python ML-serving proxy is now a Route Handler at
      // src/app/ml-api/[...path]/route.ts (a rewrite cannot inject the required
      // X-Engine-Secret header). Do NOT re-add an /ml-api rewrite here.
      {
        // Public endpoints (not under /api/v1)
        source: '/api/public/:path*',
        destination: `${process.env.INTERNAL_API_URL || 'http://localhost:4000'}/api/public/:path*`,
      },
      {
        // Guide assets from S3 (backend serves at /api/guides, not /api/v1/guides)
        source: '/api/guides/:path*',
        destination: `${process.env.INTERNAL_API_URL || 'http://localhost:4000'}/api/guides/:path*`,
      },
      {
        source: '/api/:path*',
        destination: `${process.env.INTERNAL_API_URL || 'http://localhost:4000'}/api/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400',
          },
        ],
      },
      {
        source: '/.well-known/apple-developer-merchantid-domain-association',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // pdfjs-dist optional dependencies
      config.resolve.alias.canvas = false;
      // pdfjs-dist fallbacks
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, http: false, https: false };
    }
    // Stub out the porto connector (optional wagmi dependency)
    config.resolve.alias['porto'] = false;
    config.resolve.alias['porto/internal'] = false;
    return config;
  },
};

module.exports = nextConfig;
