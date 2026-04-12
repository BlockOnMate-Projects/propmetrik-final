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
  async rewrites() {
    return [
      {
        // Exclude NextAuth routes from the API proxy
        source: '/api/auth/:path*',
        destination: '/api/auth/:path*',
      },
      {
        // Python ML-serving proxy (valuation calculations)
        source: '/ml-api/:path*',
        destination: `${process.env.PYTHON_API_URL || 'http://localhost:8001'}/api/v1/:path*`,
      },
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
